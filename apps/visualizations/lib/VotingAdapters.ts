import { Candidate, Election, Vote } from '@votelab/shared-utils';

// Constants
export const VOTER_RADIUS = 0.15;
export const DEFAULT_APPROVAL_THRESHOLD = 0.3;

// Calculate distance between two points
export const distance = (x1: number, y1: number, x2: number, y2: number): number =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

// Calculate weighted vote based on distance
export const getWeight = (dist: number, radius: number): number => {
    if (dist >= radius) {
        return 0;
    }
    // Modified to use quadratic falloff for smoother weight distribution
    const x = dist / radius;
    return 1 - (x * x);
};

// Convert a spatial vote to a ranked ballot
export function spatialVoteToRankedBallot(
    voterX: number,
    voterY: number,
    candidates: Candidate[],
    approvalThreshold: number = DEFAULT_APPROVAL_THRESHOLD
): Vote {
    // Calculate distances and sort candidates
    const rankedCandidates = candidates
        .map(candidate => ({
            id: candidate.id,
            distance: distance(voterX, voterY, candidate.x!, candidate.y!)
        }))
        .sort((a, b) => a.distance - b.distance);

    // Generate approved candidates list based on threshold
    const approvedIds = candidates
        .filter(candidate => 
            distance(voterX, voterY, candidate.x!, candidate.y!) <= approvalThreshold
        )
        .map(c => c.id);

    return {
        voterName: `Voter (${voterX.toFixed(2)}, ${voterY.toFixed(2)})`,
        ranking: rankedCandidates.map(c => c.id),
        approved: approvedIds.length > 0 ? approvedIds : [rankedCandidates[0].id],
        timestamp: new Date().toISOString()
    };
}

// Convert multiple spatial votes to an Election
export function createElectionFromSpatialVotes(
    title: string,
    candidates: Candidate[],
    voters: Array<{ x: number, y: number }>,
    approvalThreshold: number = DEFAULT_APPROVAL_THRESHOLD
): Election {
    const votes = voters.map((voter, index) => 
        spatialVoteToRankedBallot(
            voter.x,
            voter.y,
            candidates,
            approvalThreshold
        )
    );

    return {
        title,
        candidates,
        votes,
        createdAt: new Date().toISOString()
    };
}

// Helper function to simulate an election with spatial voting
export function simulateSpatialElection(
    candidates: Candidate[],
    voters: Array<{ x: number, y: number }>,
    approvalThreshold: number = DEFAULT_APPROVAL_THRESHOLD
): Record<string, number> {
    const election = createElectionFromSpatialVotes(
        "Simulated Spatial Election",
        candidates,
        voters,
        approvalThreshold
    );

    // Count first preferences for each candidate
    const votes: Record<string, number> = {};
    candidates.forEach(c => votes[c.id] = 0);

    election.votes.forEach(vote => {
        if (vote.ranking.length > 0) {
            votes[vote.ranking[0]]++;
        }
    });

    return votes;
}
