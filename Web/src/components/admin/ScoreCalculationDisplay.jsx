// ScoreCalculationDisplay.jsx - Component to display score breakdown with calculations
import { motion } from 'framer-motion';
import { Calculator, AlertTriangle, CheckCircle } from 'lucide-react';
import { ADMIN_COLORS } from '../../styles/tokens';

/**
 * ScoreCalculationDisplay Component
 * 
 * Displays the breakdown of calculated scores for a player including:
 * - Execution average
 * - Base score (when applied)
 * - Tolerance information
 * - Average marks
 * - Deductions
 * - Final score
 * 
 * Requirements: 5.3, 5.4, 5.5
 */
const ScoreCalculationDisplay = ({ playerScore }) => {
    if (!playerScore) {
        return null;
    }

    const {
        playerName,
        executionAverage,
        baseScore,
        baseScoreApplied,
        toleranceUsed,
        averageMarks,
        deduction = 0,
        otherDeduction = 0,
        finalScore
    } = playerScore;

    const totalDeductions = (deduction || 0) + (otherDeduction || 0);

    return (
        <motion.div
            className="rounded-xl border p-4 space-y-3"
            style={{
                background: baseScoreApplied 
                    ? `${ADMIN_COLORS.saffron}08` 
                    : `${ADMIN_COLORS.green}08`,
                borderColor: baseScoreApplied 
                    ? `${ADMIN_COLORS.saffron}30` 
                    : `${ADMIN_COLORS.green}30`
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Player Name Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4" style={{ color: ADMIN_COLORS.saffron }} />
                    <h4 className="font-bold text-white text-sm">{playerName}</h4>
                </div>
                {baseScoreApplied ? (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
                        style={{ 
                            background: `${ADMIN_COLORS.saffron}20`, 
                            color: ADMIN_COLORS.saffron 
                        }}>
                        <AlertTriangle className="w-3 h-3" />
                        Base Score Applied
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
                        style={{ 
                            background: `${ADMIN_COLORS.green}20`, 
                            color: ADMIN_COLORS.green 
                        }}>
                        <CheckCircle className="w-3 h-3" />
                        Within Tolerance
                    </span>
                )}
            </div>

            {/* Calculation Breakdown */}
            <div className="space-y-2">
                {/* Execution Average */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Execution Average:</span>
                    <span className="font-semibold text-white">
                        {executionAverage?.toFixed(2) || '0.00'}
                    </span>
                </div>

                {/* Base Score (only shown when applied) */}
                {baseScoreApplied && (
                    <>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">Base Score:</span>
                            <span className="font-semibold text-white">
                                {baseScore?.toFixed(2) || '0.00'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">Tolerance Applied:</span>
                            <span className="font-semibold" style={{ color: ADMIN_COLORS.saffron }}>
                                ±{toleranceUsed?.toFixed(2) || '0.00'}
                            </span>
                        </div>
                    </>
                )}

                {/* Average Marks */}
                <div className="flex items-center justify-between text-sm pt-2 border-t"
                    style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                    <span className="text-white/60">Average Marks:</span>
                    <span className="font-semibold text-white">
                        {averageMarks?.toFixed(2) || '0.00'}
                    </span>
                </div>

                {/* Deductions */}
                {totalDeductions > 0 && (
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">Total Deductions:</span>
                        <span className="font-semibold" style={{ color: ADMIN_COLORS.red }}>
                            -{totalDeductions.toFixed(2)}
                        </span>
                    </div>
                )}

                {/* Final Score - Highlighted */}
                <div className="flex items-center justify-between text-base pt-2 border-t"
                    style={{ borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                    <span className="font-bold text-white">Final Score:</span>
                    <span className="font-black text-xl" style={{ color: ADMIN_COLORS.saffron }}>
                        {finalScore?.toFixed(2) || '0.00'}
                    </span>
                </div>
            </div>

            {/* Tolerance Information (when base score is used) */}
            {baseScoreApplied && (
                <div className="mt-3 p-2 rounded-lg text-xs"
                    style={{ 
                        background: `${ADMIN_COLORS.saffron}15`,
                        borderLeft: `3px solid ${ADMIN_COLORS.saffron}`
                    }}>
                    <p className="text-white/70">
                        <span className="font-semibold text-white">Note:</span> The execution average 
                        exceeded the tolerance range (±{toleranceUsed?.toFixed(2) || '0.00'}), so the 
                        base score was calculated as the average of execution and senior judge scores.
                    </p>
                </div>
            )}
        </motion.div>
    );
};

export default ScoreCalculationDisplay;
