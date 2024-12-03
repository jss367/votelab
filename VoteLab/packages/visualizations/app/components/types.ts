export interface Candidate {
    id: string;
    x: number;
    y: number;
    color: string;
    name: string;
}

export interface Voter {
    id: string;
    x: number;
    y: number;
}

export interface ElectionResult {
    winnerId: string;
    roundDetails: string[];
    votes: Record<string, number>;
    eliminated?: string[];
}
