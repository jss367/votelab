import { Button, Card, CardContent, CardHeader, Input } from '@repo/ui';
import { initializeApp } from 'firebase/app';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminView from './AdminView';
import BallotInput from './BallotInput';
import CategoryBadges from './CategoryBadge';
import CustomFieldsInput from './CustomFieldsInput';
import CustomFieldsManager from './CustomFieldsManager';
import { removeSavedElection, saveElection } from './electionStorage';
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

type Mode = 'home' | 'create' | 'vote' | 'success' | 'results' | 'admin';

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
  const [candidateScores, setCandidateScores] = useState<Record<string, number>>({});
  const [electionSlug, setElectionSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editCandidateName, setEditCandidateName] = useState('');
  const [editCandidateFields, setEditCandidateFields] = useState<CustomFieldValue[]>([]);
  const [sortByField, setSortByField] = useState<string>('');

  const sortedVoterCandidates = (() => {
    if (!election || !sortByField) return election?.candidates || [];
    return [...election.candidates].sort((a, b) => {
      const aRaw = a.customFields?.find((f) => f.fieldId === sortByField)?.value;
      const bRaw = b.customFields?.find((f) => f.fieldId === sortByField)?.value;
      const aVal = Array.isArray(aRaw) ? aRaw.join(', ') : aRaw?.toString() || '';
      const bVal = Array.isArray(bRaw) ? bRaw.join(', ') : bRaw?.toString() || '';
      return aVal.localeCompare(bVal);
    });
  })();

  // Subscribe to real-time election updates
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const view = params.get('view');

    if (!id) return;

    setElectionId(id);
    setLoading(true);

    const v = view?.toLowerCase();
    if (v === 'results') {
      setMode('results');
    } else if (v === 'admin') {
      setMode('admin');
    } else {
      setMode('vote');
    }

    const unsubscribe = onSnapshot(
      doc(db, 'elections', id),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Election;
          setElection(data);
          setCandidates(data.candidates);
        } else {
          setError('Election not found');
        }
        setLoading(false);
      },
      (err) => {
        setError('Error loading election');
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

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

      let id: string;
      const slug = electionSlug.trim();

      if (slug) {
        // Check if slug is already taken
        const existing = await getDoc(doc(db, 'elections', slug));
        if (existing.exists()) {
          setError(`The ID "${slug}" is already taken. Choose a different one.`);
          setLoading(false);
          return;
        }
        await setDoc(doc(db, 'elections', slug), electionData);
        id = slug;
      } else {
        const docRef = await addDoc(collection(db, 'elections'), electionData);
        id = docRef.id;
      }

      saveElection({
        id,
        title: electionTitle.trim(),
        method: votingMethod,
        createdAt: electionData.createdAt,
      });
      const votingUrl = `${window.location.origin}${window.location.pathname}?id=${id}`;
      const resultsUrl = `${window.location.origin}${window.location.pathname}?id=${id}&view=results`;
      setShareUrl(votingUrl);
      setResultsUrl(resultsUrl);
      setElectionId(id);
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
      // onSnapshot handles the update automatically
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
      // onSnapshot handles the update automatically
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
      const scoreBasedMethods: VotingMethod[] = ['rrv', 'star', 'score', 'majorityJudgment', 'cumulative'];
      const vote: Vote = {
        voterName: voterName,
        ranking: scoreBasedMethods.includes(method) ? [] : candidates.map((c) => c.id),
        approved: (method === 'approval' || method === 'smithApproval')
          ? Array.from(approvedCandidates)
          : [],
        ...(scoreBasedMethods.includes(method) ? { scores: candidateScores } : {}),
        timestamp: new Date().toISOString(),
      };

      const electionRef = doc(db, 'elections', electionId);
      await updateDoc(electionRef, {
        votes: arrayUnion(vote),
      });

      // onSnapshot handles the update automatically
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

      // onSnapshot handles the update automatically
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

      // onSnapshot handles the update automatically
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

  const updateCandidate = async (updatedCandidate: Candidate) => {
    if (!electionId || !election) return;
    setError('');
    try {
      setLoading(true);
      const updatedCandidates = election.candidates.map((c) =>
        c.id === updatedCandidate.id ? updatedCandidate : c
      );
      const electionRef = doc(db, 'elections', electionId);
      await updateDoc(electionRef, { candidates: updatedCandidates });
    } catch (err) {
      setError('Error updating candidate');
      console.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
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
              <a
                href={window.location.pathname}
                className="text-sm font-bold text-slate-900 uppercase tracking-wide hover:text-blue-700 transition-colors"
              >
                VoteLab
              </a>
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
                    onChange={(e) => {
                      setElectionTitle(e.target.value);
                      if (!slugTouched) {
                        setElectionSlug(
                          e.target.value
                            .trim()
                            .replace(/\s+/g, '-')
                            .replace(/[^a-zA-Z0-9_-]/g, '')
                        );
                      }
                    }}
                    placeholder="Election Title"
                    className="w-full"
                  />
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Custom URL
                    </label>
                    <div className="flex items-center gap-0">
                      <span className="text-sm text-slate-400 bg-slate-100 border border-r-0 border-slate-300 rounded-l-md px-3 py-2">
                        votelab.web.app/?id=
                      </span>
                      <Input
                        value={electionSlug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setElectionSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''));
                        }}
                        placeholder="Election-Title"
                        className="rounded-l-none"
                      />
                    </div>
                  </div>

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
                      <option value="rrv">Reweighted Range Voting (RRV) — Score candidates</option>
                      <option value="star">STAR — Score then automatic runoff</option>
                      <option value="score">Score — Rate all candidates</option>
                      <option value="stv">STV — Proportional ranked choice</option>
                      <option value="rankedPairs">Ranked Pairs — Condorcet completion</option>
                      <option value="majorityJudgment">Majority Judgment — Grade candidates</option>
                      <option value="cumulative">Cumulative — Distribute points</option>
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
                  customFields={customFields}
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
                  </div>
                )}

                {election.submissionsClosed && !election.votingOpen && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">
                      Voting for this election has ended.
                    </p>
                  </div>
                )}

                {/* Candidate submission form - show during submission period */}
                {!election.submissionsClosed && (
                  <div className="space-y-4">
                    <Input
                      value={newCandidate}
                      onChange={(e) => setNewCandidate(e.target.value)}
                      placeholder="Add a new candidate..."
                      onKeyPress={(e) =>
                        e.key === 'Enter' && addExistingElectionCandidate()
                      }
                      className="w-full"
                    />

                    {election.customFields &&
                      election.customFields.length > 0 && (
                        <CustomFieldsInput
                          fields={election.customFields}
                          values={newCandidateFields}
                          onChange={setNewCandidateFields}
                        />
                      )}

                    <Button
                      onClick={addExistingElectionCandidate}
                      className="w-full"
                    >
                      Add Candidate
                    </Button>

                    {/* Show existing candidates */}
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-slate-900 mb-2">
                        Current Candidates:
                      </h3>
                      {election.customFields?.some((f) => f.type === 'select' || f.type === 'multiselect') && (
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-xs text-slate-500">Sort by:</label>
                          <select
                            value={sortByField}
                            onChange={(e) => setSortByField(e.target.value)}
                            className="text-xs p-1 rounded border border-slate-300 bg-white"
                          >
                            <option value="">Default</option>
                            {election.customFields
                              .filter((f) => f.type === 'select' || f.type === 'multiselect')
                              .map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                          </select>
                        </div>
                      )}
                      <div className="space-y-2">
                        {sortedVoterCandidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="p-3 bg-slate-50 rounded-md border border-slate-200"
                          >
                            {editingCandidateId === candidate.id ? (
                              <div className="space-y-3">
                                <Input
                                  value={editCandidateName}
                                  onChange={(e) => setEditCandidateName(e.target.value)}
                                  placeholder="Candidate Name"
                                  className="w-full"
                                />
                                {election.customFields && election.customFields.length > 0 && (
                                  <CustomFieldsInput
                                    fields={election.customFields}
                                    values={editCandidateFields}
                                    onChange={setEditCandidateFields}
                                  />
                                )}
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    disabled={loading}
                                    onClick={async () => {
                                      try {
                                        await updateCandidate({
                                          ...candidate,
                                          name: editCandidateName.trim() || candidate.name,
                                          customFields: editCandidateFields,
                                        });
                                        setEditingCandidateId(null);
                                      } catch {
                                        // error already set by updateCandidate; keep editor open
                                      }
                                    }}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setEditingCandidateId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{candidate.name}</span>
                                    <CategoryBadges candidate={candidate} customFields={election.customFields} />
                                  </div>
                                  {candidate.customFields &&
                                    candidate.customFields.length > 0 && (
                                      <div className="mt-1 text-sm text-slate-600">
                                        {candidate.customFields.map((field) => {
                                          const fieldDef = election.customFields?.find(
                                            (f) => f.id === field.fieldId
                                          );
                                          if (!fieldDef) return null;
                                          return (
                                            <span key={field.fieldId} className="inline-block mr-3">
                                              <span className="font-medium">{fieldDef.name}:</span>{' '}
                                              {field.value?.toString()}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                </div>
                                <button
                                  onClick={() => {
                                    setEditingCandidateId(candidate.id);
                                    setEditCandidateName(candidate.name);
                                    setEditCandidateFields(candidate.customFields || []);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800 underline ml-2 shrink-0"
                                >
                                  Edit
                                </button>
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
                    <Input
                      value={voterName}
                      onChange={(e) => setVoterName(e.target.value)}
                      placeholder="Your Name"
                      className="w-full"
                    />

                    <BallotInput
                      method={election.votingMethod || 'smithApproval'}
                      candidates={candidates}
                      customFields={election.customFields}
                      onChange={({ ranking, approved, scores }) => {
                        if (ranking.length > 0) setCandidates(ranking);
                        setApprovedCandidates(new Set(approved));
                        if (scores) setCandidateScores(scores);
                      }}
                    />

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

            {/* Success mode */}
            {mode === 'success' && (
              <div className="text-center space-y-4 py-8">
                <h2 className="text-2xl font-bold text-green-700">Vote Submitted!</h2>
                <p className="text-slate-600">Thank you for voting. Your vote has been recorded.</p>
                {electionId && election && !election.votingOpen && (
                  <Button
                    onClick={() => setMode('results')}
                  >
                    View Results
                  </Button>
                )}
              </div>
            )}

            {/* Results mode */}
            {mode === 'results' && election && (
              <MethodResults election={election} />
            )}

            {/* Admin mode */}
            {mode === 'admin' && election && electionId && (
              <AdminView
                election={election}
                electionId={electionId}
                onCloseSubmissions={closeSubmissions}
                onCloseVoting={closeVoting}
                onReopenVoting={async () => {
                  if (!electionId) return;
                  try {
                    setLoading(true);
                    await updateDoc(doc(db, 'elections', electionId), { votingOpen: true });
                    // onSnapshot handles the update automatically
                  } catch (err) {
                    setError('Error reopening voting');
                    console.error(err);
                  } finally {
                    setLoading(false);
                  }
                }}
                onDelete={async () => {
                  if (!electionId) return;
                  try {
                    setLoading(true);
                    await deleteDoc(doc(db, 'elections', electionId));
                    removeSavedElection(electionId);
                    setMode('home');
                    setElection(null);
                    setElectionId(null);
                    window.history.replaceState({}, '', window.location.pathname);
                  } catch (err) {
                    setError('Error deleting election');
                    console.error(err);
                  } finally {
                    setLoading(false);
                  }
                }}
                onUpdate={async (fields) => {
                  if (!electionId) return;
                  try {
                    await updateDoc(doc(db, 'elections', electionId), fields);
                  } catch (err) {
                    setError('Error updating election');
                    console.error(err);
                  }
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
