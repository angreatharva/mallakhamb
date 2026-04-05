import React from 'react';
import DesignTokenAudit from '../../components/design-system/audit/DesignTokenAudit';

/**
 * DesignTokenAuditPage - Standalone page for design token audit
 * 
 * Access this page during development to review all design tokens
 * Route: /design-tokens (add to your router configuration)
 * 
 * **Validates: Requirements 14.3, 14.5, 14.6, 14.7**
 */
const DesignTokenAuditPage = () => {
  return <DesignTokenAudit />;
};

export default DesignTokenAuditPage;
