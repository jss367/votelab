import { describe, expect, test } from 'vitest';
import { distance, getWeight, runElection, simulateElection, VotingMethod } from './ElectionUtils';
import type { Candidate } from './types';

describe('Election utilities', () => {
    describe('distance calculation', () => {
        test('calculates correct distances', () => {
            expect(distance(0, 0, 3, 4)).toBe(5); // 3-4-5 triangle
            expect(distance(1, 1, 1, 1)).toBe(0); // Same point
            expect(distance(0, 0, 1, 0)).toBe(1); // Horizontal
            expect(distance(0, 0, 0, 1)).toBe(1); // Vertical
        });
    });

    describe('weight calculation', () => {
        test('calculates weights correctly', () => {
            const radius = 0.3;
            expect(getWeight(0, radius)).toBe(1); // At center
            expect(getWeight(radius, radius)).toBe(0); // At boundary
            expect(getWeight(radius * 2, radius)).toBe(0); // Outside
            // Mid-point should have weight 0.5
            expect(getWeight(radius / 2, radius)).toBeCloseTo(0.75, 2);
        });
    });

    describe('runElection', () => {
        const defaultCandidates: Candidate[] = [
            { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
            { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
            { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' }
        ];

        const methods: VotingMethod[] = ['plurality', 'approval', 'irv'];

        test('handles empty candidate list', () => {
            methods.forEach(method => {
                expect(() => runElection(method, 0.5, 0.5, [])).toThrow('No candidates provided');
            });
        });

        test('handles single candidate', () => {
            const singleCandidate = [defaultCandidates[0]];
            methods.forEach(method => {
                expect(runElection(method, 0.5, 0.5, singleCandidate)).toBe('1');
            });
        });

        describe('Plurality voting', () => {
            test('selects closest candidate', () => {
                // Test points near each candidate
                expect(runElection('plurality', 0.31, 0.71, defaultCandidates)).toBe('1');
                expect(runElection('plurality', 0.51, 0.51, defaultCandidates)).toBe('2');
                expect(runElection('plurality', 0.71, 0.31, defaultCandidates)).toBe('3');
            });

            test('handles equidistant case', () => {
                const equalCandidates: Candidate[] = [
                    { id: '1', x: 0.4, y: 0.5, color: '#22c55e', name: 'A' },
                    { id: '2', x: 0.6, y: 0.5, color: '#ef4444', name: 'B' }
                ];
                const result = runElection('plurality', 0.5, 0.5, equalCandidates);
                expect(['1', '2']).toContain(result);
            });
        });

        describe('Approval voting', () => {
            test('approves candidates within threshold', () => {
                const threshold = 0.3;
                
                // Test point very close to candidate A
                expect(runElection('approval', 0.31, 0.71, defaultCandidates, threshold)).toBe('1');
                
                // Test point between candidates but closer to B
                expect(runElection('approval', 0.45, 0.55, defaultCandidates, threshold)).toBe('2');
            });

            test('falls back to plurality when no candidates within threshold', () => {
                const threshold = 0.1; // Very small threshold
                const result = runElection('approval', 0.4, 0.4, defaultCandidates, threshold);
                // Should choose closest candidate
                expect(result).toBe('2');
            });
        });

        describe('IRV voting', () => {
            test('ranks candidates by distance', () => {
                // Test point closest to A
                const result1 = runElection('irv', 0.3, 0.7, defaultCandidates);
                expect(result1).toBe('1');

                // Test point closest to C
                const result2 = runElection('irv', 0.7, 0.3, defaultCandidates);
                expect(result2).toBe('3');
            });
        });
    });

    describe('simulateElection', () => {
        const candidates: Candidate[] = [
            { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
            { id: '2', x: 0.7, y: 0.3, color: '#ef4444', name: 'B' }
        ];

        test('counts votes correctly', () => {
            const voters = [
                { x: 0.2, y: 0.8 }, // Should vote for A
                { x: 0.8, y: 0.2 }, // Should vote for B
                { x: 0.3, y: 0.7 }  // Should vote for A
            ];

            const result = simulateElection('plurality', voters, candidates);
            expect(result).toEqual({ '1': 2, '2': 1 });
        });

        test('handles empty voter list', () => {
            const result = simulateElection('plurality', [], candidates);
            expect(result).toEqual({ '1': 0, '2': 0 });
        });
    });
});
