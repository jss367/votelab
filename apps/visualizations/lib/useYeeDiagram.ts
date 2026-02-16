'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Voter,
  SpatialCandidate,
  VotingMethod,
  generateYeeDiagram,
  YeeDiagramResult,
} from '@votelab/shared-utils';

interface UseYeeDiagramOptions {
  voters: Voter[];
  candidates: SpatialCandidate[];
  method: VotingMethod;
  resolution?: number;
  approvalThreshold?: number;
}

interface UseYeeDiagramReturn {
  result: YeeDiagramResult | null;
  isComputing: boolean;
  error: Error | null;
  recompute: () => void;
}

export const useYeeDiagram = ({
  voters,
  candidates,
  method,
  resolution = 100,
  approvalThreshold = 0.3,
}: UseYeeDiagramOptions): UseYeeDiagramReturn => {
  const [result, setResult] = useState<YeeDiagramResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const computeRef = useRef(0);

  const compute = useCallback(() => {
    const computeId = ++computeRef.current;
    setIsComputing(true);
    setError(null);

    setTimeout(() => {
      try {
        if (computeId !== computeRef.current) return;

        const diagramResult = generateYeeDiagram({
          voters,
          candidates,
          method,
          resolution,
          approvalThreshold,
        });

        if (computeId === computeRef.current) {
          setResult(diagramResult);
          setIsComputing(false);
        }
      } catch (err) {
        if (computeId === computeRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsComputing(false);
        }
      }
    }, 0);
  }, [voters, candidates, method, resolution, approvalThreshold]);

  useEffect(() => {
    if (voters.length > 0 && candidates.length > 0) {
      compute();
    }
  }, [compute]);

  return {
    result,
    isComputing,
    error,
    recompute: compute,
  };
};
