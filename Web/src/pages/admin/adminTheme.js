/**
 * Admin Design System
 * 
 * DEPRECATED: This file is maintained for backward compatibility.
 * Please use the unified design tokens from '@/styles/tokens' instead.
 * 
 * Migration guide:
 * - import { ADMIN_COLORS } from './adminTheme' 
 *   → import { ADMIN_COLORS } from '@/styles/tokens'
 * 
 * - statusColor(status) → getStatusColor(status)
 * - statusBg(status) → getStatusBg(status)
 */

import { 
  ADMIN_COLORS, 
  ADMIN_EASE_OUT, 
  ADMIN_SPRING,
  getStatusColor,
  getStatusBg,
} from '../../styles/tokens';

// Re-export for backward compatibility
export { ADMIN_COLORS, ADMIN_EASE_OUT, ADMIN_SPRING };

// Legacy function names (deprecated)
export const statusColor = getStatusColor;
export const statusBg = getStatusBg;
