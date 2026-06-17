import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@repo/ui';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Candidate, Election } from './types';

interface CandidateSubmissionProps {
  election: Election;
  electionId: string; // Need to pass this separately since it's not in Election type
  db: any;
  onSubmit: () => void;
}

const CandidateSubmission: React.FC<CandidateSubmissionProps> = ({
  election,
  electionId,
  db,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if submissions are allowed
  const canSubmit = !election.submissionsClosed;

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

      const electionRef = doc(db, 'elections', electionId);
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
            <Input
              placeholder={election.candidateLabel || "Candidate Name"}
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
