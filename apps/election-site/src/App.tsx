import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import {
    Candidate,
    Election,
    Vote
} from '@votelab/shared-utils';
import { initializeApp } from 'firebase/app';
import {
    addDoc,
    arrayUnion,
    collection,
    doc,
    getDoc,
    getFirestore,
    updateDoc
} from 'firebase/firestore';
import { Check, Circle, Copy, Grip, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { DropResult } from 'react-beautiful-dnd';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from './components/ui';

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyD2cDOH0jIstu_e7NxPWpjf1cBb9utmxpU",
    authDomain: "rank-and-approve-voting.firebaseapp.com",
    projectId: "rank-and-approve-voting",
    storageBucket: "rank-and-approve-voting.firebasestorage.app",
    messagingSenderId: "457756698776",
    appId: "1:457756698776:web:e1326245c652affb7b08ed",
    measurementId: "G-1KCG6HW8RT"
};

interface Candidate {
    id: string;
    name: string;
}

interface Vote {
    voterName: string;
    ranking: string[];
    approved: string[];
    timestamp: string;
}

interface Election {
    title: string;
    candidates: Candidate[];
    votes: Vote[];
    createdAt: string;
}

type Mode = 'home' | 'create' | 'vote' | 'success' | 'results';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function App() {
    const [mode, setMode] = useState<Mode>('home');
    const [electionId, setElectionId] = useState<string | null>(null);
    const [electionTitle, setElectionTitle] = useState('');
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [newCandidate, setNewCandidate] = useState('');
    const [approvedCandidates, setApprovedCandidates] = useState<Set<string>>(new Set());
    const [voterName, setVoterName] = useState('');
    const [election, setElection] = useState<Election | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [shareUrl, setShareUrl] = useState('');
    const [resultsUrl, setResultsUrl] = useState('');

    const loadElection = useCallback(async (id: string) => {
        try {
            setLoading(true);
            setError(''); // Clear any existing errors
            const electionDoc = await getDoc(doc(db, 'elections', id));
            if (electionDoc.exists()) {
                const data = electionDoc.data() as Election;
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
            if (view === 'results') {
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
        try {
            setLoading(true);
            const electionData: Election = {
                title: electionTitle,
                candidates: candidates,
                votes: [],
                createdAt: new Date().toISOString()
            };

            const docRef = await addDoc(collection(db, 'elections'), electionData);
            const votingUrl = `${window.location.origin}${window.location.pathname}?id=${docRef.id}`;
            const resultsUrl = `${window.location.origin}${window.location.pathname}?id=${docRef.id}&view=results`;
            setShareUrl(votingUrl);
            setResultsUrl(resultsUrl); // Store the results URL in state
            setElectionId(docRef.id);
        } catch (err) {
            // ... error handling
        } finally {
            setLoading(false);
        }
    };

    const submitVote = async () => {
        if (!voterName.trim() || !electionId) {
            setError('Please enter your name');
            return;
        }

        try {
            setLoading(true);
            const vote: Vote = {
                voterName: voterName,
                ranking: candidates.map(c => c.id),
                approved: Array.from(approvedCandidates),
                timestamp: new Date().toISOString()
            };

            const electionRef = doc(db, 'elections', electionId);
            await updateDoc(electionRef, {
                votes: arrayUnion(vote)
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

    const addCandidate = () => {
        if (newCandidate.trim()) {
            const newCand: Candidate = {
                id: Date.now().toString(),
                name: newCandidate.trim()
            };
            setCandidates([...candidates, newCand]);
            setNewCandidate('');
        }
    };

    const removeCandidate = (id: string) => {
        setCandidates(candidates.filter(c => c.id !== id));
        const newApproved = new Set(approvedCandidates);
        newApproved.delete(id);
        setApprovedCandidates(newApproved);
    };

    const toggleApproval = (id: string) => {
        const newApproved = new Set(approvedCandidates);
        if (newApproved.has(id)) {
            newApproved.delete(id);
        } else {
            newApproved.add(id);
        }
        setApprovedCandidates(newApproved);
    };

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) {
            return;
        }

        const items = Array.from(candidates);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        setCandidates(items);
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
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-bold text-slate-900">
                            {mode === 'results' ? `Results: ${election?.title || 'Loading...'}` : 'Rank and Approve Vote'}
                        </CardTitle>
                        {election?.title && mode !== 'results' && (
                            <p className="text-slate-500 text-sm">{election.title}</p>
                        )}
                    </CardHeader>
                    <CardContent>
                        {error && (
                            <div className="mb-6 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                                {error}
                            </div>
                        )}

                        {mode === 'home' && (
                            <div className="space-y-4">
                                <Button
                                    className="w-full"
                                    size="lg"
                                    onClick={() => setMode('create')}
                                >
                                    Create New Election
                                </Button>
                            </div>
                        )}

                        {mode === 'create' && (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <Input
                                        value={electionTitle}
                                        onChange={(e) => setElectionTitle(e.target.value)}
                                        placeholder="Election Title"
                                        className="w-full"
                                    />

                                    <div className="flex gap-2">
                                        <Input
                                            value={newCandidate}
                                            onChange={(e) => setNewCandidate(e.target.value)}
                                            placeholder="Add a candidate..."
                                            onKeyPress={(e) => e.key === 'Enter' && addCandidate()}
                                            className="flex-1"
                                        />
                                        <Button onClick={addCandidate} variant="secondary">
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <DragDropContext onDragEnd={handleDragEnd}>
                                    <Droppable droppableId="candidates">
                                        {(provided) => (
                                            <div
                                                {...provided.droppableProps}
                                                ref={provided.innerRef}
                                                className="space-y-2"
                                            >
                                                {candidates.map((candidate, index) => (
                                                    <Draggable
                                                        key={candidate.id}
                                                        draggableId={candidate.id}
                                                        index={index}
                                                    >
                                                        {(provided) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                className="flex items-center gap-3 p-3 bg-slate-100 rounded-lg border border-slate-200 shadow-sm"
                                                            >
                                                                <span {...provided.dragHandleProps}>
                                                                    <Grip className="w-4 h-4 text-slate-400" />
                                                                </span>
                                                                <span className="flex-grow font-medium text-slate-700">
                                                                    {candidate.name}
                                                                </span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => removeCandidate(candidate.id)}
                                                                    className="text-slate-500 hover:text-destructive"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>

                                {candidates.length > 0 && (
                                    <Button
                                        className="w-full"
                                        size="lg"
                                        onClick={createElection}
                                    >
                                        Create Election
                                    </Button>
                                )}

                                {shareUrl && (
                                    <div className="mt-6 p-4 bg-slate-100 rounded-lg border border-slate-200">
                                        <p className="mb-2 font-medium text-slate-900">Share this link with voters:</p>
                                        <div className="flex gap-2 mb-4">
                                            <Input value={shareUrl} readOnly className="bg-white" />
                                            <Button onClick={() => navigator.clipboard.writeText(shareUrl)} variant="secondary">
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <p className="mb-2 font-medium text-slate-900">Results URL:</p>
                                        <div className="flex gap-2">
                                            <Input value={resultsUrl} readOnly className="bg-white" />
                                            <Button onClick={() => navigator.clipboard.writeText(resultsUrl)} variant="secondary">
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}


                            </div>
                        )}

                        {mode === 'vote' && election && (
                            <div className="space-y-6">
                                <Input
                                    value={voterName}
                                    onChange={(e) => setVoterName(e.target.value)}
                                    placeholder="Your Name"
                                    className="w-full"
                                />

                                <div className="space-y-4">
                                    <div className="text-sm text-slate-500 space-y-1">
                                        <p>1. Drag to rank the candidates in your preferred order</p>
                                        <p>2. Click the checkmark to approve candidates you'd be happy with</p>
                                    </div>

                                    <DragDropContext onDragEnd={handleDragEnd}>
                                        <Droppable droppableId="voting">
                                            {(provided) => (
                                                <div
                                                    {...provided.droppableProps}
                                                    ref={provided.innerRef}
                                                    className="space-y-2"
                                                >
                                                    {candidates.map((candidate, index) => (
                                                        <Draggable
                                                            key={candidate.id}
                                                            draggableId={candidate.id}
                                                            index={index}
                                                        >
                                                            {(provided) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    {...provided.dragHandleProps}
                                                                    className="flex items-center gap-3 p-3 bg-slate-100 rounded-lg border border-slate-200 shadow-sm"
                                                                >
                                                                    <span className="w-6 font-medium text-slate-500">
                                                                        {index + 1}.
                                                                    </span>
                                                                    <span className="flex-grow font-medium text-slate-700">
                                                                        {candidate.name}
                                                                    </span>
                                                                    <Button
                                                                        variant={approvedCandidates.has(candidate.id) ? "default" : "outline"}
                                                                        size="sm"
                                                                        onClick={() => toggleApproval(candidate.id)}
                                                                        className={approvedCandidates.has(candidate.id) ? "bg-green-600 hover:bg-green-700" : "text-slate-500"}
                                                                    >
                                                                        {approvedCandidates.has(candidate.id) ? (
                                                                            <Check className="w-4 h-4" />
                                                                        ) : (
                                                                            <Circle className="w-4 h-4" />
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    ))}
                                                    {provided.placeholder}
                                                </div>
                                            )}
                                        </Droppable>
                                    </DragDropContext>
                                </div>

                                <Button
                                    className="w-full"
                                    size="lg"
                                    onClick={submitVote}
                                    disabled={!voterName.trim()}
                                >
                                    Submit Vote
                                </Button>
                            </div>
                        )}

                        {mode === 'success' && (
                            <div className="text-center py-6 space-y-4">
                                <h2 className="text-xl font-bold text-slate-900">Vote Submitted!</h2>
                                <p className="text-slate-500">Thank you for voting.</p>
                            </div>
                        )}

                        {mode === 'results' && election && (
                            <ElectionResults election={election} />
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default App;
