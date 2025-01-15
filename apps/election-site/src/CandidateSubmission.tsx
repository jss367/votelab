import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@repo/ui';
import { formatDistanceToNow } from 'date-fns';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Candidate, Election } from './types';

interface CandidateSubmissionProps {
  election: Election;
  db: any;
  onSubmit: () => void;
}

const CandidateSubmission: React.FC<CandidateSubmissionProps> = ({
  election,
  db,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    !election.isClosed &&
    (!election.submissionDeadline ||
      new Date(election.submissionDeadline) > new Date());

  const submitCandidate = async () => {
    if (!name.trim() || !submitterName.trim()) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      const newCandidate: Candidate = {
        id: Date.now().toString(),
        name: name.trim(),
      };

      const submission: CandidateSubmission = {
        candidateId: newCandidate.id,
        submittedBy: submitterName.trim(),
        submittedAt: new Date().toISOString(),
      };

      const electionRef = doc(db, 'elections', election.id);
      await updateDoc(electionRef, {
        candidates: arrayUnion(newCandidate),
      });

      setName('');
      setSubmitterName('');
      onSubmit();
    } catch (err) {
      setError('Error submitting candidate');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a Candidate</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-2 bg-destructive/10 text-destructive rounded">
            {error}
          </div>
        )}

        {!canSubmit ? (
          <div className="text-destructive">
            Submissions are no longer accepted for this election.
          </div>
        ) : (
          <div className="space-y-4">
            {election.submissionDeadline && (
              <p className="text-sm text-muted-foreground">
                Submissions close in{' '}
                {formatDistanceToNow(new Date(election.submissionDeadline))}
              </p>
            )}

            <Input
              placeholder="Candidate Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Input
              placeholder="Your Name"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
            />

            <Button
              onClick={submitCandidate}
              disabled={loading || !name.trim() || !submitterName.trim()}
              className="w-full"
            >
              Submit Candidate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CandidateSubmission;
