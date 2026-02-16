import { useState, useEffect, useRef } from 'react';
import {
  SpatialCandidate,
  Voter,
  VotingMethod,
  generatePerturbationMap,
  PerturbationResult,
} from '@votelab/shared-utils';

interface UsePerturbationMapProps {
  voters: Voter[];
  candidates: SpatialCandidate[];
  targetCandidate: SpatialCandidate;
  method: VotingMethod;
  resolution?: number;
  maxVoterPercent?: number;
  approvalThreshold?: number;
}

interface UsePerturbationMapResult {
  result: PerturbationResult | null;
  isComputing: boolean;
}

export const usePerturbationMap = ({
  voters,
  candidates,
  targetCandidate,
  method,
  resolution = 40,
  maxVoterPercent = 0.5,
  approvalThreshold = 0.3,
}: UsePerturbationMapProps): UsePerturbationMapResult => {
  const [result, setResult] = useState<PerturbationResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const computeIdRef = useRef(0);

  useEffect(() => {
    if (voters.length === 0 || candidates.length < 2) {
      setResult(null);
      return;
    }

    const computeId = ++computeIdRef.current;
    setIsComputing(true);

    // Use requestAnimationFrame to avoid blocking UI
    requestAnimationFrame(() => {
      if (computeId !== computeIdRef.current) return;

      const newResult = generatePerturbationMap({
        candidates,
        voters,
        targetCandidate,
        method,
        resolution,
        maxVoterPercent,
        approvalThreshold,
      });

      if (computeId === computeIdRef.current) {
        setResult(newResult);
        setIsComputing(false);
      }
    });
  }, [
    voters,
    candidates,
    targetCandidate,
    method,
    resolution,
    maxVoterPercent,
    approvalThreshold,
  ]);

  return { result, isComputing };
};
