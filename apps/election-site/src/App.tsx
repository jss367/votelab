import { Button, Card, CardContent, CardHeader, Input } from '@repo/ui';
import { initializeApp } from 'firebase/app';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getFirestore,
  updateDoc,
} from 'firebase/firestore';
import { Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import BallotInput from './BallotInput';
import CustomFieldsInput from './CustomFieldsInput';
import CustomFieldsManager from './CustomFieldsManager';
import HomePage from './HomePage';
import MethodResults from './MethodResults';
import RankedApprovalList from './RankedApprovalList';
import {
  Candidate,
  CustomField,
  CustomFieldValue,
  Election,
  Vote,
  VotingMethod,
} from './types';

// Firebase config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

type Mode = 'home' | 'create' | 'vote' | 'success' | 'results';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [electionId, setElectionId] = useState<string | null>(null);
  const [electionTitle, setElectionTitle] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newCandidate, setNewCandidate] = useState('');
  const [approvedCandidates, setApprovedCandidates] = useState<Set<string>>(
    new Set()
  );
  const [voterName, setVoterName] = useState('');
  const [election, setElection] = useState<Election | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [resultsUrl, setResultsUrl] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [newCandidateFields, setNewCandidateFields] = useState<
    CustomFieldValue[]
  >([]);
  const [votingMethod, setVotingMethod] = useState<VotingMethod>('plurality');

  const loadElection = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError('');
      const electionDoc = await getDoc(doc(db, 'elections', id));

      if (electionDoc.exists()) {
        const data = electionDoc.data() as Election;

        console.log('Election data:', data);
        console.log('Candidates:', data.candidates);

        setElection(data);
        setCandidates(data.candidates);
      } else {
        setError('Election not found');
      }
    } catch (err) {
      setError('Error loading election');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const view = params.get('view');

    if (id) {
      setElectionId(id);
      loadElection(id);
      if (view?.toLowerCase() === 'results') {
        setMode('results');
      } else {
        setMode('vote');
      }
    }
  }, [loadElection]);

  useEffect(() => {
    if (mode === 'results' && electionId) {
      loadElection(electionId);
    }
  }, [mode, electionId, loadElection]);

  const createElection = async () => {
    if (!creatorName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!electionTitle.trim()) {
      setError('Please enter an election title');
      return;
    }

    try {
      setLoading(true);
      const electionData: Election = {
        title: electionTitle.trim(),
        votingMethod,
        candidates: candidates || [],
        votes: [],
        createdAt: new Date().toISOString(),
        submissionsClosed: !isOpen,
        votingOpen: !isOpen,
        createdBy: creatorName.trim(),
        customFields: customFields,
      };

      const docRef = await addDoc(collection(db, 'elections'), electionData);
      const votingUrl = `${window.location.origin}${window.location.pathname}?id=${docRef.id}`;
      const resultsUrl = `${window.location.origin}${window.location.pathname}?id=${docRef.id}&view=results`;
      setShareUrl(votingUrl);
      setResultsUrl(resultsUrl);
      setElectionId(docRef.id);
    } catch (err) {
      setError('Error creating election');
      console.error('Election creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const closeSubmissions = async () => {
    if (!electionId) {
      return;
    }

    try {
      setLoading(true);
      const electionRef = doc(db, 'elections', electionId);
      await updateDoc(electionRef, {
        submissionsClosed: true,
        votingOpen: true,
      });
      await loadElection(electionId);
    } catch (err) {
      setError('Error closing submissions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const closeVoting = async () => {
    if (!electionId) {
      return;
    }

    try {
      setLoading(true);
      const electionRef = doc(db, 'elections', electionId);
      await updateDoc(electionRef, {
        votingOpen: false,
      });
      await loadElection(electionId);
    } catch (err) {
      setError('Error closing voting');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const submitVote = async () => {
    if (!voterName.trim() || !electionId) {
      setError('Please enter your name');
      return;
    }

    if (!election?.votingOpen) {
      setError('Voting is not currently open for this election');
      return;
    }

    try {
      setLoading(true);
      const method = election.votingMethod || 'smithApproval';
      const vote: Vote = {
        voterName: voterName,
        ranking: method === 'approval' ? [] : candidates.map((c) => c.id),
        approved: (method === 'plurality' || method === 'irv' || method === 'borda' || method === 'condorcet')
          ? []
          : Array.from(approvedCandidates),
        timestamp: new Date().toISOString(),
      };

      const electionRef = doc(db, 'elections', electionId);
      await updateDoc(electionRef, {
        votes: arrayUnion(vote),
      });

      await loadElection(electionId);
      setMode('success');
    } catch (err) {
      setError('Error submitting vote');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addCandidate = async () => {
    console.log('Add Candidate clicked');
    console.log('newCandidate:', newCandidate);
    console.log('electionId:', electionId);
    if (!newCandidate.trim() || !electionId) {
      return;
    }

    // Validate required fields
    if (election?.customFields) {
      const missingRequired = election.customFields
        .filter((field) => field.required)
        .some(
          (field) =>
            !newCandidateFields.find((f) => f.fieldId === field.id && f.value)
        );

      if (missingRequired) {
        setError('Please fill in all required fields');
        return;
      }
    }

    try {
      setLoading(true);
      const newCand: Candidate = {
        id: Date.now().toString(),
        name: newCandidate.trim(),
        customFields: newCandidateFields,
      };

      const electionRef = doc(db, 'elections', electionId);
      await updateDoc(electionRef, {
        candidates: arrayUnion(newCand),
      });

      await loadElection(electionId);
      setNewCandidate('');
      setNewCandidateFields([]); // Reset custom fields after adding
    } catch (err) {
      setError('Error adding candidate');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addLocalCandidate = () => {
    console.log('Adding local candidate in creation mode');
    console.log('Current newCandidate:', newCandidate);

    if (!newCandidate.trim()) {
      setError('Please enter a candidate name');
      return;
    }

    const newCand = {
      id: Date.now().toString(),
      name: newCandidate.trim(),
      customFields: newCandidateFields,
    };

    console.log('Adding new candidate:', newCand);
    setCandidates([...candidates, newCand]);
    setNewCandidate('');
    setNewCandidateFields([]);
    console.log('Updated candidates list:', [...candidates, newCand]);
  };

  const addExistingElectionCandidate = async () => {
    console.log('Adding candidate to existing election');
    if (!newCandidate.trim() || !electionId) {
      console.log('Validation failed:', { newCandidate, electionId });
      setError('Please enter a candidate name');
      return;
    }

    // Validate required fields
    if (election?.customFields) {
      const missingRequired = election.customFields
        .filter((field) => field.required)
        .some(
          (field) =>
            !newCandidateFields.find((f) => f.fieldId === field.id && f.value)
        );

      if (missingRequired) {
        setError('Please fill in all required fields');
        return;
      }
    }

    try {
      setLoading(true);
      const newCand = {
        id: Date.now().toString(),
        name: newCandidate.trim(),
        customFields: newCandidateFields,
      };

      const electionRef = doc(db, 'elections', electionId);
      await updateDoc(electionRef, {
        candidates: arrayUnion(newCand),
      });

      await loadElection(electionId);
      setNewCandidate('');
      setNewCandidateFields([]);
    } catch (err) {
      console.error('Error adding candidate:', err);
      setError('Error adding candidate');
    } finally {
      setLoading(false);
    }
  };

  const removeCandidate = (id: string) => {
    setCandidates(candidates.filter((c) => c.id !== id));
    const newApproved = new Set(approvedCandidates);
    newApproved.delete(id);
    setApprovedCandidates(newApproved);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="space-y-3">
            <div>
              <h1 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                VoteLab
              </h1>
              <h2 className="text-3xl font-medium text-slate-500 mt-1">
                {mode === 'results'
                  ? election?.title || 'Loading...'
                  : election?.title || ''}
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-6 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            {/* Home mode */}
            {mode === 'home' && (
              <HomePage
                onSelectMethod={(method) => {
                  setVotingMethod(method);
                  setMode('create');
                }}
              />
            )}

            {/* Create mode */}
            {mode === 'create' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <Input
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full"
                  />
                  <Input
                    value={electionTitle}
                    onChange={(e) => setElectionTitle(e.target.value)}
                    placeholder="Election Title"
                    className="w-full"
                  />

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Voting Method</label>
                    <select
                      value={votingMethod}
                      onChange={(e) => setVotingMethod(e.target.value as VotingMethod)}
                      className="w-full p-2 rounded-md border border-slate-300 bg-white text-sm"
                    >
                      <option value="plurality">Plurality — Pick one</option>
                      <option value="approval">Approval — Approve many</option>
                      <option value="irv">Instant Runoff (IRV) — Rank candidates</option>
                      <option value="borda">Borda Count — Rank for points</option>
                      <option value="condorcet">Condorcet — Pairwise matchups</option>
                      <option value="smithApproval">Smith + Approval — Rank and approve</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="isOpen"
                      checked={isOpen}
                      onChange={(e) => setIsOpen(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="isOpen" className="text-sm text-gray-700">
                      Allow voters to add candidates during submission period
                    </label>
                  </div>
                  {isOpen && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                      <p className="font-medium mb-2">
                        Tip for Closing Submissions:
                      </p>
                      <p>
                        After creating the election, you can close the
                        submission period by:
                      </p>
                      <ul className="list-disc list-inside mt-1">
                        <li>
                          Using the same name you used to create the election
                        </li>
                        <li>
                          Clicking the "Close Submission Period & Start Voting"
                          button
                        </li>
                        <li>
                          This will prevent new candidates from being added
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
                <CustomFieldsManager
                  fields={customFields}
                  onChange={setCustomFields}
                />

                {/* Add candidate input */}
                <div className="space-y-4 p-4 bg-slate-100 rounded-lg border border-slate-200">
                  <Input
                    value={newCandidate}
                    onChange={(e) => setNewCandidate(e.target.value)}
                    placeholder="Candidate Name"
                    className="w-full bg-white"
                  />
                  {customFields.length > 0 && (
                    <CustomFieldsInput
                      fields={customFields}
                      values={newCandidateFields}
                      onChange={setNewCandidateFields}
                    />
                  )}
                  <Button
                    onClick={
                      mode === 'create'
                        ? addLocalCandidate
                        : addExistingElectionCandidate
                    }
                    className="w-full"
                    size="lg"
                  >
                    Add Candidate
                  </Button>
                </div>

                {/* Candidate list */}
                <RankedApprovalList
                  candidates={candidates}
                  onChange={({ ranking }) => {
                    setCandidates(ranking);
                    // Don't update approvedCandidates during creation
                  }}
                  onRemove={removeCandidate}
                  showApprovalLine={false}
                />

                {/* Create election button and share URLs */}
                {(candidates.length > 0 || isOpen) && (
                  <Button className="w-full" size="lg" onClick={createElection}>
                    Create Election
                  </Button>
                )}

                {shareUrl && (
                  <div className="mt-6 p-4 bg-slate-100 rounded-lg border border-slate-200">
                    <p className="mb-2 font-medium text-slate-900">
                      Share this link with voters:
                    </p>
                    <div className="flex gap-2 mb-4">
                      <Input value={shareUrl} readOnly className="bg-white" />
                      <Button
                        onClick={() => navigator.clipboard.writeText(shareUrl)}
                        variant="secondary"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="mb-2 font-medium text-slate-900">
                      Results URL:
                    </p>
                    <div className="flex gap-2">
                      <Input value={resultsUrl} readOnly className="bg-white" />
                      <Button
                        onClick={() =>
                          navigator.clipboard.writeText(resultsUrl)
                        }
                        variant="secondary"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Vote mode */}
            {mode === 'vote' && election && (
              <div className="space-y-6">
                {/* Status Banner */}
                {!election.submissionsClosed && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800">
                      This election is in the submission period.{' '}
                      {election.votingOpen
                        ? 'You can add candidates and vote.'
                        : 'You can add candidates. Voting will begin when the submission period ends.'}
                    </p>
                    {election.createdBy === voterName && (
                      <Button
                        onClick={closeSubmissions}
                        variant="secondary"
                        className="mt-2"
                      >
                        Close Submission Period & Start Voting
                      </Button>
                    )}
                  </div>
                )}

                {election.submissionsClosed && !election.votingOpen && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">
                      Voting for this election has ended.
                    </p>
                  </div>
                )}

                <Input
                  value={voterName}
                  onChange={(e) => setVoterName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full"
                />

                {/* Candidate submission form - show during submission period */}
                {!election.submissionsClosed && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={newCandidate}
                        onChange={(e) => setNewCandidate(e.target.value)}
                        placeholder="Add a new candidate..."
                        onKeyPress={(e) =>
                          e.key === 'Enter' && addExistingElectionCandidate()
                        }
                      />
                      <Button
                        onClick={addExistingElectionCandidate}
                        variant="secondary"
                        className="px-3"
                      >
                        Add
                      </Button>
                    </div>

                    {election.customFields &&
                      election.customFields.length > 0 && (
                        <CustomFieldsInput
                          fields={election.customFields}
                          values={newCandidateFields}
                          onChange={setNewCandidateFields}
                        />
                      )}

                    {/* Show existing candidates */}
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-slate-900 mb-2">
                        Current Candidates:
                      </h3>
                      <div className="space-y-2">
                        {election.candidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="p-2 bg-slate-50 rounded-md border border-slate-200"
                          >
                            <div className="font-medium">{candidate.name}</div>
                            {candidate.customFields &&
                              candidate.customFields.length > 0 && (
                                <div className="mt-1 text-sm text-slate-600">
                                  {candidate.customFields.map((field) => {
                                    const fieldDef =
                                      election.customFields?.find(
                                        (f) => f.id === field.fieldId
                                      );
                                    if (!fieldDef) {
                                      return null;
                                    }
                                    return (
                                      <span
                                        key={field.fieldId}
                                        className="inline-block mr-3"
                                      >
                                        <span className="font-medium">
                                          {fieldDef.name}:
                                        </span>{' '}
                                        {field.value?.toString()}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Voting interface - show when voting is open */}
                {election.votingOpen && (
                  <>
                    <BallotInput
                      method={election.votingMethod || 'smithApproval'}
                      candidates={candidates}
                      onChange={({ ranking, approved }) => {
                        setCandidates(ranking);
                        setApprovedCandidates(new Set(approved));
                      }}
                    />

                    {election.createdBy === voterName &&
                      election.votingOpen && (
                        <Button
                          onClick={closeVoting}
                          variant="secondary"
                          className="w-full"
                        >
                          Close Voting
                        </Button>
                      )}

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={submitVote}
                      disabled={!voterName.trim() || !election.votingOpen}
                    >
                      Submit Vote
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Results mode */}
            {mode === 'results' && election && (
              <MethodResults election={election} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
