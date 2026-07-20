'use client';

import { Button, Card, CardContent, CardHeader, Input } from '@repo/ui';
import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Copy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminView from './AdminView';
import BallotInput from './BallotInput';
import CandidateDetails from './CandidateDetails';
import CustomFieldsInput from './CustomFieldsInput';
import CustomFieldsManager from './CustomFieldsManager';
import { isCustomFieldValueMissing } from './customFieldValue';
import {
  getSavedElections,
  removeSavedElection,
  saveElection,
  type SavedElection,
} from './electionStorage';
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
import { auth, db } from './firebaseConfig';

type Mode = 'home' | 'create' | 'vote' | 'success' | 'results' | 'admin';

const getFirebaseAuthCode = (err: unknown) =>
  typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: string }).code)
    : '';

const getGoogleAuthMessage = (err: unknown) => {
  const code = getFirebaseAuthCode(err);

  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in was closed before it finished.';
  }

  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the Google sign-in popup.';
  }

  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is not enabled for this Firebase project.';
  }

  return 'Google sign-in failed. Try again.';
};

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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
  // The voter's ranking for this ballot, kept separate from the election's
  // candidate list so that a real-time snapshot (e.g. another voter submitting)
  // does not wipe the order the current voter is building. Holds candidate ids.
  const [ballotRanking, setBallotRanking] = useState<string[]>([]);
  const [electionSlug, setElectionSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [sortByField, setSortByField] = useState<string>('');
  const [candidateLabel, setCandidateLabel] = useState('');
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserIsAnonymous, setCurrentUserIsAnonymous] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authActionLoading, setAuthActionLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [localSavedElections, setLocalSavedElections] =
    useState<SavedElection[]>(getSavedElections);
  const [cloudSavedElections, setCloudSavedElections] = useState<SavedElection[]>(
    []
  );

  const ensureSignedIn = useCallback(async () => {
    if (auth.currentUser) {
      return auth.currentUser.uid;
    }
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  }, []);

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

  const savedElections = useMemo(() => {
    const byId = new Map<string, SavedElection>();

    for (const election of localSavedElections) {
      byId.set(election.id, election);
    }

    for (const election of cloudSavedElections) {
      byId.set(election.id, election);
    }

    return Array.from(byId.values()).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
  }, [cloudSavedElections, localSavedElections]);

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserUid(user?.uid ?? null);
      setCurrentUserName(user?.displayName ?? null);
      setCurrentUserEmail(user?.email ?? null);
      setCurrentUserIsAnonymous(user?.isAnonymous ?? true);
      setAuthReady(true);
    });

    ensureSignedIn().catch((err) => {
      setError('Error initializing anonymous sign-in');
      console.error('Anonymous sign-in error:', err);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, [ensureSignedIn]);

  useEffect(() => {
    if (!currentUserUid) {
      setCloudSavedElections([]);
      return;
    }

    const ownedElections = query(
      collection(db, 'elections'),
      where('createdByUid', '==', currentUserUid)
    );

    return onSnapshot(
      ownedElections,
      (snapshot) => {
        setCloudSavedElections(
          snapshot.docs.map((snapshotDoc) => {
            const data = snapshotDoc.data() as Election;

            return {
              id: snapshotDoc.id,
              title: data.title,
              method: data.votingMethod || 'smithApproval',
              createdAt: data.createdAt,
            };
          })
        );
      },
      (err) => {
        console.error('Error loading account elections:', err);
      }
    );
  }, [currentUserUid]);

  const signInWithGoogle = async () => {
    setAccountError('');
    setAuthActionLoading(true);

    try {
      if (auth.currentUser?.isAnonymous) {
        try {
          await linkWithPopup(auth.currentUser, googleProvider);
          return;
        } catch (err) {
          const code = getFirebaseAuthCode(err);

          if (
            code !== 'auth/credential-already-in-use' &&
            code !== 'auth/email-already-in-use'
          ) {
            throw err;
          }
        }
      }

      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAccountError(getGoogleAuthMessage(err));
      console.error('Google sign-in error:', err);
    } finally {
      setAuthActionLoading(false);
    }
  };

  const signOutOfGoogle = async () => {
    setAccountError('');
    setAuthActionLoading(true);

    try {
      await signOut(auth);
      await ensureSignedIn();
    } catch (err) {
      setAccountError('Sign-out failed. Try again.');
      console.error('Sign-out error:', err);
    } finally {
      setAuthActionLoading(false);
    }
  };

  const createElection = async () => {
    if (!creatorName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!electionTitle.trim()) {
      setError('Please enter an election title');
      return;
    }

    // Revalidate every candidate against the required fields before publishing.
    // Candidates added before a field was marked required (or before a template
    // with required fields was loaded) are only checked at append time, so the
    // initial list could otherwise be published with required metadata blank.
    const requiredFields = customFields.filter((field) => field.required);
    const hasCandidateMissingRequired = candidates.some((candidate) =>
      requiredFields.some((field) =>
        isCustomFieldValueMissing(
          candidate.customFields?.find((cf) => cf.fieldId === field.id)?.value
        )
      )
    );
    if (hasCandidateMissingRequired) {
      setError(
        'Some candidates are missing required fields. Fill them in before creating the election.'
      );
      return;
    }

    try {
      setLoading(true);
      const createdByUid = await ensureSignedIn();
      const electionData: Election = {
        title: electionTitle.trim(),
        votingMethod,
        candidates: candidates || [],
        votes: [],
        createdAt: new Date().toISOString(),
        submissionsClosed: !isOpen,
        votingOpen: !isOpen,
        createdBy: creatorName.trim(),
        createdByUid,
        customFields: customFields,
        ...(candidateLabel ? { candidateLabel } : {}),
      };

      let id: string;
      const slug = electionSlug.trim();

      if (slug) {
        // Reserve and create the slug atomically. A plain getDoc-then-setDoc
        // has a race: two creators choosing the same custom URL could both pass
        // the existence check and the later setDoc would overwrite the first
        // election. A transaction makes the check-and-create atomic.
        const slugRef = doc(db, 'elections', slug);
        try {
          await runTransaction(db, async (tx) => {
            const existing = await tx.get(slugRef);
            if (existing.exists()) {
              throw new Error('SLUG_TAKEN');
            }
            tx.set(slugRef, electionData);
          });
        } catch (err) {
          if (err instanceof Error && err.message === 'SLUG_TAKEN') {
            setError(
              `The ID "${slug}" is already taken. Choose a different one.`
            );
            setLoading(false);
            return;
          }
          throw err;
        }
        id = slug;
      } else {
        const docRef = await addDoc(collection(db, 'elections'), electionData);
        id = docRef.id;
      }

      const savedElection = {
        id,
        title: electionTitle.trim(),
        method: votingMethod,
        createdAt: electionData.createdAt,
      };

      saveElection(savedElection);
      setLocalSavedElections(getSavedElections());
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
      await ensureSignedIn();
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
      await ensureSignedIn();
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

    // No candidates means there is nothing to vote on; submitting would store an
    // empty ballot and the results tallies (Approval/Score/Borda/etc.) crash
    // when dereferencing the first entry of an empty candidate set. This can
    // happen if an open-submission election has submissions closed before any
    // candidate was added.
    if (candidates.length === 0) {
      setError('This election has no candidates to vote on yet');
      return;
    }

    const method = election.votingMethod || 'smithApproval';
    const scoreBasedMethods: VotingMethod[] = ['rrv', 'star', 'score', 'majorityJudgment', 'cumulative'];
    // Drop any ids that no longer exist (a candidate can be deleted while the
    // voter is mid-ballot, leaving a stale id in ballotRanking/approved that
    // would otherwise be submitted as an unknown candidate).
    const validIds = new Set(candidates.map((c) => c.id));
    const filteredRanking = ballotRanking.filter((id) => validIds.has(id));

    // Plurality counts only ranking[0], so the candidate-order fallback below
    // would silently award the vote to whichever candidate is listed first if
    // the voter submitted without picking anyone. Require an explicit choice.
    if (method === 'plurality' && filteredRanking.length === 0) {
      setError('Please select a candidate before submitting your ballot');
      return;
    }

    // Majority Judgment: an ungraded candidate is emitted as -1 by the ballot.
    // tallyMajorityJudgment treats a missing/zero score as Reject, so submitting
    // a partly-graded ballot would silently record Reject for candidates the
    // voter never graded. Require an explicit grade for every candidate.
    if (method === 'majorityJudgment') {
      const hasUngraded = candidates.some(
        (c) => (candidateScores[c.id] ?? -1) < 0
      );
      if (hasUngraded) {
        setError('Please grade every candidate before submitting your ballot');
        return;
      }
    }

    try {
      setLoading(true);
      await ensureSignedIn();
      // For ranked methods, use the voter's ballot ordering. Fall back to the
      // election's candidate order if they didn't reorder anything (or their
      // only selections were since-deleted candidates). Plurality is handled by
      // the validation above and never reaches the fallback empty-handed.
      const ranking =
        filteredRanking.length > 0
          ? filteredRanking
          : candidates.map((c) => c.id);
      const vote: Vote = {
        voterName: voterName,
        ranking: scoreBasedMethods.includes(method) ? [] : ranking,
        approved: (method === 'approval' || method === 'smithApproval')
          ? Array.from(approvedCandidates).filter((id) => validIds.has(id))
          : [],
        ...(scoreBasedMethods.includes(method) ? { scores: candidateScores } : {}),
        timestamp: new Date().toISOString(),
      };

      const electionRef = doc(db, 'elections', electionId);
      // Re-read inside a transaction and abort if voting has closed since the
      // ballot was opened — a plain append would record a vote after close from
      // a stale votingOpen snapshot.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(electionRef);
        if (!snap.exists()) {
          throw new Error('ELECTION_NOT_FOUND');
        }
        if (!(snap.data() as Election).votingOpen) {
          throw new Error('VOTING_CLOSED');
        }
        tx.update(electionRef, { votes: arrayUnion(vote) });
      });

      // onSnapshot handles the update automatically
      setMode('success');
    } catch (err) {
      if (err instanceof Error && err.message === 'VOTING_CLOSED') {
        setError('Voting has closed for this election.');
      } else {
        setError('Error submitting vote');
      }
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
        .some((field) => {
          const entry = newCandidateFields.find((f) => f.fieldId === field.id);
          return !entry || isCustomFieldValueMissing(entry.value);
        });

      if (missingRequired) {
        setError('Please fill in all required fields');
        return;
      }
    }

    try {
      setLoading(true);
      await ensureSignedIn();
      const newCand: Candidate = {
        id: crypto.randomUUID(),
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

    // Enforce required custom fields here too, not just in the existing-election
    // submission path — otherwise the creator's initial candidate list can be
    // published with required metadata blank. In create mode the fields live in
    // the local `customFields` state (the election doc does not exist yet).
    const missingRequired = customFields
      .filter((field) => field.required)
      .some((field) => {
        const entry = newCandidateFields.find((f) => f.fieldId === field.id);
        return !entry || isCustomFieldValueMissing(entry.value);
      });
    if (missingRequired) {
      setError('Please fill in all required fields');
      return;
    }

    const newCand = {
      id: crypto.randomUUID(),
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
        .some((field) => {
          const entry = newCandidateFields.find((f) => f.fieldId === field.id);
          return !entry || isCustomFieldValueMissing(entry.value);
        });

      if (missingRequired) {
        setError('Please fill in all required fields');
        return;
      }
    }

    try {
      setLoading(true);
      await ensureSignedIn();
      const newCand = {
        id: crypto.randomUUID(),
        name: newCandidate.trim(),
        customFields: newCandidateFields,
      };

      const electionRef = doc(db, 'elections', electionId);
      // Re-read inside a transaction and abort if submissions have closed since
      // the form was opened — a plain append could add a candidate after close
      // (and after voting started) from a stale snapshot, changing the candidate
      // set out from under already-cast ballots.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(electionRef);
        if (!snap.exists()) {
          throw new Error('ELECTION_NOT_FOUND');
        }
        if ((snap.data() as Election).submissionsClosed) {
          throw new Error('SUBMISSIONS_CLOSED');
        }
        tx.update(electionRef, { candidates: arrayUnion(newCand) });
      });

      // onSnapshot handles the update automatically
      setNewCandidate('');
      setNewCandidateFields([]);
    } catch (err) {
      if (err instanceof Error && err.message === 'SUBMISSIONS_CLOSED') {
        setError('Submissions have closed for this election.');
      } else {
        setError('Error adding candidate');
      }
      console.error('Error adding candidate:', err);
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
                savedElections={savedElections}
                authReady={authReady}
                isAnonymous={currentUserIsAnonymous}
                accountName={currentUserName}
                accountEmail={currentUserEmail}
                accountError={accountError}
                authActionLoading={authActionLoading}
                onSignInWithGoogle={signInWithGoogle}
                onSignOut={signOutOfGoogle}
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
                        {typeof window !== 'undefined'
                          ? `${window.location.host}${window.location.pathname}?id=`
                          : '?id='}
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
                      <p className="font-medium mb-1">
                        Managing Your Election
                      </p>
                      <p>
                        After creating the election, you can close submissions, edit
                        candidates, and manage voting from the admin page. You'll need
                        the browser that creates the election to manage it.
                      </p>
                    </div>
                  )}
                </div>
                <CustomFieldsManager
                  fields={customFields}
                  onChange={setCustomFields}
                  onCandidateLabelChange={setCandidateLabel}
                />

                {/* Add candidate input */}
                <div className="space-y-4 p-4 bg-slate-100 rounded-lg border border-slate-200">
                  <Input
                    value={newCandidate}
                    onChange={(e) => setNewCandidate(e.target.value)}
                    placeholder={candidateLabel || "Candidate Name"}
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
                    <p className="mb-2 font-medium text-slate-900 mt-4">
                      Admin URL:
                    </p>
                    <div className="flex gap-2">
                      <Input value={`${shareUrl}&view=admin`} readOnly className="bg-white" />
                      <Button
                        onClick={() => navigator.clipboard.writeText(`${shareUrl}&view=admin`)}
                        variant="secondary"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      Manage this election from this browser, which is signed in as the creator.
                    </p>
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
                      placeholder={election?.candidateLabel ? `Add a new ${election.candidateLabel.toLowerCase()}...` : "Add a new candidate..."}
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
                            {/* Read-only on the public ballot: voters can add
                                candidates during open submissions, but editing
                                and deleting candidates is an admin-only action
                                (handled in AdminView). */}
                            <CandidateDetails candidate={candidate} customFields={election.customFields} />
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
                        if (ranking.length > 0)
                          setBallotRanking(ranking.map((c) => c.id));
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
                currentUserUid={currentUserUid}
                authReady={authReady}
                onCloseSubmissions={closeSubmissions}
                onCloseVoting={closeVoting}
                onReopenVoting={async () => {
                  if (!electionId) return;
                  try {
                    setLoading(true);
                    await ensureSignedIn();
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
                    await ensureSignedIn();
                    await deleteDoc(doc(db, 'elections', electionId));
                    removeSavedElection(electionId);
                    setLocalSavedElections(getSavedElections());
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
                    await ensureSignedIn();
                    await updateDoc(doc(db, 'elections', electionId), fields);
                  } catch (err) {
                    setError('Error updating election');
                    console.error(err);
                  }
                }}
                onEditCandidate={async (candidateId, updates) => {
                  if (!electionId) return;
                  // Re-read inside a transaction and apply the edit to the
                  // freshest candidates array so a candidate submitted
                  // concurrently by a voter is not clobbered.
                  try {
                    await ensureSignedIn();
                    const ref = doc(db, 'elections', electionId);
                    await runTransaction(db, async (tx) => {
                      const snap = await tx.get(ref);
                      if (!snap.exists()) return;
                      const data = snap.data() as Election;
                      const candidates = (data.candidates || []).map((c) =>
                        c.id === candidateId
                          ? {
                              ...c,
                              name: updates.name.trim() || c.name,
                              customFields: updates.customFields,
                            }
                          : c
                      );
                      tx.update(ref, { candidates });
                    });
                  } catch (err) {
                    setError('Error updating candidate');
                    console.error(err);
                  }
                }}
                onRemoveCandidate={async (candidateId) => {
                  if (!electionId) return;
                  try {
                    await ensureSignedIn();
                    const ref = doc(db, 'elections', electionId);
                    await runTransaction(db, async (tx) => {
                      const snap = await tx.get(ref);
                      if (!snap.exists()) return;
                      const data = snap.data() as Election;
                      const candidates = (data.candidates || []).filter(
                        (c) => c.id !== candidateId
                      );
                      tx.update(ref, { candidates });
                    });
                  } catch (err) {
                    setError('Error removing candidate');
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
