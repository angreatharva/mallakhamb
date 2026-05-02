// ScoreCalculationDisplay.test.jsx - Unit tests for ScoreCalculationDisplay component
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ScoreCalculationDisplay from './ScoreCalculationDisplay';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }) => <div {...props}>{children}</div>
    }
}));

describe('ScoreCalculationDisplay', () => {
    const mockPlayerScoreWithinTolerance = {
        playerId: 'player1',
        playerName: 'John Doe',
        executionAverage: 8.5,
        baseScore: 0,
        baseScoreApplied: false,
        toleranceUsed: 0.2,
        averageMarks: 8.5,
        deduction: 0.5,
        otherDeduction: 0.2,
        finalScore: 7.8
    };

    const mockPlayerScoreWithBaseScore = {
        playerId: 'player2',
        playerName: 'Jane Smith',
        executionAverage: 8.5,
        baseScore: 8.25,
        baseScoreApplied: true,
        toleranceUsed: 0.2,
        averageMarks: 8.25,
        deduction: 0.3,
        otherDeduction: 0.1,
        finalScore: 7.85
    };

    describe('Component Rendering', () => {
        it('should render null when playerScore is not provided', () => {
            const { container } = render(<ScoreCalculationDisplay playerScore={null} />);
            expect(container.firstChild).toBeNull();
        });

        it('should render player name correctly', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.getByText('John Doe')).toBeInTheDocument();
        });

        it('should display execution average', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.getByText('Execution Average:')).toBeInTheDocument();
            // Execution average and average marks can have the same value
            const eightFiftyScores = screen.getAllByText('8.50');
            expect(eightFiftyScores.length).toBeGreaterThan(0);
        });

        it('should display average marks', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.getByText('Average Marks:')).toBeInTheDocument();
            // Execution average and average marks can have the same value
            const eightFiftyScores = screen.getAllByText('8.50');
            expect(eightFiftyScores.length).toBeGreaterThan(0);
        });

        it('should display final score with correct formatting', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.getByText('Final Score:')).toBeInTheDocument();
            expect(screen.getByText('7.80')).toBeInTheDocument();
        });
    });

    describe('Base Score Display', () => {
        it('should show "Within Tolerance" badge when base score is not applied', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.getByText('Within Tolerance')).toBeInTheDocument();
        });

        it('should show "Base Score Applied" badge when base score is applied', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithBaseScore} />);
            expect(screen.getByText('Base Score Applied')).toBeInTheDocument();
        });

        it('should display base score value when applied', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithBaseScore} />);
            expect(screen.getByText('Base Score:')).toBeInTheDocument();
            // Base score and average marks can have the same value, so use getAllByText
            const scoreElements = screen.getAllByText('8.25');
            expect(scoreElements.length).toBeGreaterThan(0);
        });

        it('should not display base score when not applied', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.queryByText('Base Score:')).not.toBeInTheDocument();
        });

        it('should display tolerance information when base score is applied', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithBaseScore} />);
            expect(screen.getByText('Tolerance Applied:')).toBeInTheDocument();
            expect(screen.getByText('±0.20')).toBeInTheDocument();
        });

        it('should show tolerance explanation note when base score is applied', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithBaseScore} />);
            expect(screen.getByText(/The execution average exceeded the tolerance range/)).toBeInTheDocument();
        });

        it('should not show tolerance explanation when base score is not applied', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.queryByText(/The execution average exceeded the tolerance range/)).not.toBeInTheDocument();
        });
    });

    describe('Deductions Display', () => {
        it('should display total deductions when present', () => {
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.getByText('Total Deductions:')).toBeInTheDocument();
            expect(screen.getByText('-0.70')).toBeInTheDocument();
        });

        it('should not display deductions section when total is zero', () => {
            const scoreWithoutDeductions = {
                ...mockPlayerScoreWithinTolerance,
                deduction: 0,
                otherDeduction: 0
            };
            render(<ScoreCalculationDisplay playerScore={scoreWithoutDeductions} />);
            expect(screen.queryByText('Total Deductions:')).not.toBeInTheDocument();
        });

        it('should handle missing deduction values gracefully', () => {
            const scoreWithMissingDeductions = {
                ...mockPlayerScoreWithinTolerance,
                deduction: undefined,
                otherDeduction: undefined
            };
            render(<ScoreCalculationDisplay playerScore={scoreWithMissingDeductions} />);
            expect(screen.queryByText('Total Deductions:')).not.toBeInTheDocument();
        });
    });

    describe('Calculated Score Extraction', () => {
        it('should handle all calculated fields correctly', () => {
            const completeScore = {
                playerId: 'player3',
                playerName: 'Test Player',
                executionAverage: 9.2,
                baseScore: 9.0,
                baseScoreApplied: true,
                toleranceUsed: 0.1,
                averageMarks: 9.0,
                deduction: 0.2,
                otherDeduction: 0.1,
                finalScore: 8.7
            };
            
            render(<ScoreCalculationDisplay playerScore={completeScore} />);
            
            expect(screen.getByText('Test Player')).toBeInTheDocument();
            expect(screen.getByText('9.20')).toBeInTheDocument(); // execution average
            // Base score and average marks have the same value, use getAllByText
            const ninePointScores = screen.getAllByText('9.00');
            expect(ninePointScores.length).toBe(2); // base score and average marks
            expect(screen.getByText('±0.10')).toBeInTheDocument(); // tolerance
            expect(screen.getByText('-0.30')).toBeInTheDocument(); // total deductions
            expect(screen.getByText('8.70')).toBeInTheDocument(); // final score
        });

        it('should handle zero values correctly', () => {
            const zeroScore = {
                playerId: 'player4',
                playerName: 'Zero Player',
                executionAverage: 0,
                baseScore: 0,
                baseScoreApplied: false,
                toleranceUsed: 0,
                averageMarks: 0,
                deduction: 0,
                otherDeduction: 0,
                finalScore: 0
            };
            
            render(<ScoreCalculationDisplay playerScore={zeroScore} />);
            
            expect(screen.getByText('Zero Player')).toBeInTheDocument();
            expect(screen.getAllByText('0.00')).toHaveLength(3); // execution avg, average marks, final score
        });

        it('should handle missing optional fields gracefully', () => {
            const minimalScore = {
                playerName: 'Minimal Player',
                executionAverage: 7.5,
                averageMarks: 7.5,
                finalScore: 7.5
            };
            
            render(<ScoreCalculationDisplay playerScore={minimalScore} />);
            
            expect(screen.getByText('Minimal Player')).toBeInTheDocument();
            // All three values are 7.50, use getAllByText
            const sevenFiftyScores = screen.getAllByText('7.50');
            expect(sevenFiftyScores.length).toBe(3); // execution avg, average marks, final score
        });
    });

    describe('Lock Status Display', () => {
        it('should not display lock status in ScoreCalculationDisplay component', () => {
            // Lock status is displayed at the parent level (AdminScoring), not in individual score cards
            render(<ScoreCalculationDisplay playerScore={mockPlayerScoreWithinTolerance} />);
            expect(screen.queryByText('Locked')).not.toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('should handle undefined playerScore gracefully', () => {
            const { container } = render(<ScoreCalculationDisplay playerScore={undefined} />);
            expect(container.firstChild).toBeNull();
        });

        it('should handle empty playerScore object', () => {
            const emptyScore = {};
            render(<ScoreCalculationDisplay playerScore={emptyScore} />);
            
            // Should still render but with default/empty values (0.00 appears 3 times)
            const zeroScores = screen.getAllByText('0.00');
            expect(zeroScores.length).toBe(3); // execution avg, average marks, final score
        });

        it('should handle null values in score fields', () => {
            const scoreWithNulls = {
                playerName: 'Null Player',
                executionAverage: null,
                baseScore: null,
                baseScoreApplied: false,
                toleranceUsed: null,
                averageMarks: null,
                deduction: null,
                otherDeduction: null,
                finalScore: null
            };
            
            render(<ScoreCalculationDisplay playerScore={scoreWithNulls} />);
            
            expect(screen.getByText('Null Player')).toBeInTheDocument();
            expect(screen.getAllByText('0.00')).toHaveLength(3);
        });
    });

    describe('Formatting', () => {
        it('should format all numeric values to 2 decimal places', () => {
            const scoreWithDecimals = {
                playerName: 'Decimal Player',
                executionAverage: 8.567,
                baseScore: 8.234,
                baseScoreApplied: true,
                toleranceUsed: 0.234,
                averageMarks: 8.234,
                deduction: 0.567,
                otherDeduction: 0.123,
                finalScore: 7.544
            };
            
            render(<ScoreCalculationDisplay playerScore={scoreWithDecimals} />);
            
            expect(screen.getByText('8.57')).toBeInTheDocument(); // execution average
            // Base score and average marks have the same value, use getAllByText
            const eightTwentyThreeScores = screen.getAllByText('8.23');
            expect(eightTwentyThreeScores.length).toBe(2); // base score and average marks
            expect(screen.getByText('±0.23')).toBeInTheDocument(); // tolerance
            expect(screen.getByText('-0.69')).toBeInTheDocument(); // total deductions (0.567 + 0.123)
            expect(screen.getByText('7.54')).toBeInTheDocument(); // final score
        });
    });
});
