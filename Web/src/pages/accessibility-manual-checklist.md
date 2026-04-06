# Accessibility Testing Manual Checklist
## Pages Folder Refactoring - Task 12

This document provides a comprehensive manual testing checklist for accessibility compliance across all refactored pages.

---

## Task 12.1: Keyboard Navigation Testing
**Validates: Requirement 12.3**

### Test Procedure

#### Tab Key Navigation
Test on all major pages:
- [ ] **UnifiedLogin** (Admin, Coach, Player, Judge, SuperAdmin)
  - Navigate to `/admin/login`, `/coach/login`, `/player/login`, `/judge/login`, `/superadmin/login`
  - Press Tab key repeatedly
  - Verify focus moves through: Email input → Password input → Login button → "Forgot Password" link → "Register" link (if applicable)
  - Verify focus indicators are visible on each element
  
- [ ] **UnifiedRegister** (Coach, Player)
  - Navigate to `/coach/register`, `/player/register`
  - Press Tab key repeatedly
  - Verify focus moves through all form fields in logical order
  - Verify focus indicators are visible
  
- [ ] **UnifiedDashboard** (Admin, SuperAdmin)
  - Navigate to `/admin/dashboard`, `/superadmin/dashboard`
  - Press Tab key repeatedly
  - Verify focus moves through navigation tabs, buttons, and interactive elements
  - Verify focus indicators are visible
  
- [ ] **UnifiedCompetitionSelection** (Coach, Player)
  - Navigate to `/coach/select-competition`, `/player/select-team`
  - Press Tab key repeatedly
  - Verify focus moves through competition/team cards
  - Verify focus indicators are visible

- [ ] **Home Page**
  - Navigate to `/`
  - Press Tab key repeatedly
  - Verify focus moves through all navigation links and buttons
  - Verify focus indicators are visible

- [ ] **Public Scores**
  - Navigate to `/public-scores`
  - Press Tab key repeatedly
  - Verify focus moves through all interactive elements
  - Verify focus indicators are visible

- [ ] **Forgot Password / Reset Password**
  - Navigate to `/forgot-password` and `/reset-password`
  - Press Tab key repeatedly
  - Verify focus moves through form fields and buttons
  - Verify focus indicators are visible

#### Enter/Space Key Activation
- [ ] **All Buttons**
  - Focus on any button using Tab
  - Press Enter key → Button should activate
  - Press Space key → Button should activate
  
- [ ] **Form Submission**
  - Focus on any input field in a form
  - Press Enter key → Form should submit (or show validation errors)

#### Escape Key Functionality
- [ ] **Modals/Dialogs**
  - Open any modal or dialog (e.g., ConfirmDialog)
  - Press Escape key → Modal should close
  
- [ ] **Dropdowns**
  - Open any dropdown menu
  - Press Escape key → Dropdown should close

#### Shift+Tab (Reverse Navigation)
- [ ] **All Pages**
  - Tab to the last interactive element
  - Press Shift+Tab repeatedly
  - Verify focus moves backwards through elements in reverse order

---

## Task 12.2: Screen Reader Compatibility Testing
**Validates: Requirement 12.5**

### Test Procedure

#### Screen Reader Setup
- **Windows**: Install NVDA (free) from https://www.nvaccess.org/
- **Mac**: Use built-in VoiceOver (Cmd+F5)
- **Linux**: Install Orca

#### ARIA Labels Test
- [ ] **Icon-Only Buttons**
  - Navigate through all pages with screen reader
  - Verify all icon-only buttons announce their purpose
  - Example: Close button should announce "Close" or "Close dialog"
  
- [ ] **Form Inputs**
  - Navigate to login/register forms
  - Verify each input announces its label
  - Example: Email input should announce "Email" or "Email address"

#### Alt Text Test
- [ ] **All Images**
  - Navigate through all pages with screen reader
  - Verify all meaningful images have descriptive alt text
  - Verify decorative images are marked with empty alt="" or aria-hidden="true"
  - Check: Logo images, background images, icons

#### Button Labels Test
- [ ] **All Buttons**
  - Navigate through all pages with screen reader
  - Verify every button announces its purpose
  - Verify buttons with text content announce the text
  - Verify icon buttons have aria-label

#### Form Error Announcements
- [ ] **Login Form**
  - Submit form with empty fields
  - Verify screen reader announces validation errors
  - Verify errors are associated with their inputs
  
- [ ] **Register Form**
  - Submit form with invalid data
  - Verify screen reader announces validation errors
  - Verify errors are associated with their inputs

#### Semantic HTML Test
- [ ] **All Pages**
  - Use screen reader to navigate by headings (H key in NVDA)
  - Verify proper heading hierarchy (h1 → h2 → h3)
  - Verify at least one h1 per page
  - Use screen reader to navigate by landmarks (D key in NVDA)
  - Verify main content is in <main> or role="main"
  - Verify navigation is in <nav> or role="navigation"

---

## Task 12.3: Color Contrast Testing
**Validates: Requirements 8.8, 12.6**

### Test Procedure

#### Tools
- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Browser DevTools**: Chrome/Edge DevTools Accessibility panel
- **axe DevTools Extension**: https://www.deque.com/axe/devtools/

#### WCAG AA Compliance Test
- [ ] **Normal Text (< 18pt)**
  - Minimum contrast ratio: 4.5:1
  - Test on all pages:
    - Body text
    - Form labels
    - Button text
    - Link text
    - Error messages
  
- [ ] **Large Text (≥ 18pt or ≥ 14pt bold)**
  - Minimum contrast ratio: 3:1
  - Test on all pages:
    - Headings
    - Large buttons
    - Hero text

#### Focus Indicators Test
- [ ] **All Interactive Elements**
  - Minimum contrast ratio: 3:1
  - Tab through all interactive elements
  - Verify focus ring/outline is visible
  - Verify focus indicator has sufficient contrast against background
  - Test on:
    - Buttons
    - Links
    - Form inputs
    - Cards
    - Navigation items

#### Automated Testing
- [ ] **Run axe DevTools**
  - Install axe DevTools browser extension
  - Navigate to each page
  - Run "Scan ALL of my page"
  - Verify no color contrast violations
  - Test pages:
    - `/admin/login`
    - `/coach/register`
    - `/player/dashboard`
    - `/`
    - `/public-scores`
    - `/forgot-password`

---

## Task 12.4: Touch Targets Testing
**Validates: Requirements 12.1, 17.8**

### Test Procedure

#### Minimum 44px Touch Targets
- [ ] **All Buttons**
  - Use browser DevTools to inspect button dimensions
  - Verify minimum height: 44px
  - Verify minimum width: 44px (for icon-only buttons)
  - Test on:
    - Login/Register buttons
    - Navigation buttons
    - Icon buttons
    - Close buttons
    - Submit buttons

- [ ] **All Form Inputs**
  - Use browser DevTools to inspect input dimensions
  - Verify minimum height: 44px
  - Test on:
    - Text inputs
    - Email inputs
    - Password inputs
    - Select dropdowns
    - Textareas

- [ ] **All Links**
  - Use browser DevTools to inspect link dimensions
  - Verify adequate padding for touch
  - Verify minimum touch area: 44px × 44px
  - Test on:
    - Navigation links
    - Footer links
    - In-content links

#### Mobile Testing
- [ ] **Responsive Design**
  - Open browser DevTools
  - Toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M)
  - Test on device presets:
    - iPhone SE (375px)
    - iPhone 12 Pro (390px)
    - iPad (768px)
    - Samsung Galaxy S20 (360px)
  
- [ ] **Touch Target Spacing**
  - Verify adequate spacing between interactive elements
  - Minimum spacing: 8px
  - Test on:
    - Button groups
    - Form fields
    - Navigation menus
    - Card grids

#### Real Device Testing (if available)
- [ ] **iOS Devices**
  - Test on iPhone (any model)
  - Verify all buttons are easily tappable
  - Verify no accidental taps on adjacent elements
  
- [ ] **Android Devices**
  - Test on Android phone (any model)
  - Verify all buttons are easily tappable
  - Verify no accidental taps on adjacent elements

---

## Task 12.5: Reduced Motion Support Testing
**Validates: Requirement 12.7**

### Test Procedure

#### Enable Reduced Motion

**Windows 10/11:**
1. Settings → Ease of Access → Display
2. Turn ON "Show animations in Windows"
3. OR use browser DevTools:
   - Open DevTools (F12)
   - Press Ctrl+Shift+P
   - Type "Emulate CSS prefers-reduced-motion"
   - Select "prefers-reduced-motion: reduce"

**macOS:**
1. System Preferences → Accessibility → Display
2. Check "Reduce motion"

**Linux:**
1. Settings → Universal Access → Seeing
2. Turn ON "Reduce animation"

#### Test Animation Behavior
- [ ] **UnifiedLogin**
  - Enable reduced motion
  - Navigate to `/admin/login`
  - Verify animations are disabled or significantly reduced
  - Check: Fade-in animations, slide animations, background animations
  
- [ ] **UnifiedRegister**
  - Enable reduced motion
  - Navigate to `/coach/register`
  - Verify animations are disabled or significantly reduced
  
- [ ] **Home Page**
  - Enable reduced motion
  - Navigate to `/`
  - Verify animations are disabled or significantly reduced
  - Check: Hero animations, scroll animations, hover effects
  
- [ ] **UnifiedDashboard**
  - Enable reduced motion
  - Navigate to `/admin/dashboard`
  - Verify animations are disabled or significantly reduced
  - Check: Chart animations, card animations, transitions

#### Test useReducedMotion Hook
- [ ] **Verify Hook Behavior**
  - Open browser console
  - Enable reduced motion in OS settings
  - Refresh page
  - Verify animations are disabled
  - Disable reduced motion in OS settings
  - Refresh page
  - Verify animations are enabled

#### Test Framer Motion Integration
- [ ] **Motion Components**
  - Enable reduced motion
  - Navigate through all pages
  - Verify framer-motion components respect reduced motion
  - Check: FadeIn components, animated backgrounds, transitions

---

## Comprehensive Testing Matrix

### All Pages Checklist

| Page | Keyboard Nav | Screen Reader | Color Contrast | Touch Targets | Reduced Motion |
|------|-------------|---------------|----------------|---------------|----------------|
| UnifiedLogin (Admin) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedLogin (Coach) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedLogin (Player) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedLogin (Judge) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedLogin (SuperAdmin) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedRegister (Coach) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedRegister (Player) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedDashboard (Admin) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedDashboard (SuperAdmin) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedCompetitionSelection (Coach) | ☐ | ☐ | ☐ | ☐ | ☐ |
| UnifiedCompetitionSelection (Player) | ☐ | ☐ | ☐ | ☐ | ☐ |
| CoachDashboard | ☐ | ☐ | ☐ | ☐ | ☐ |
| PlayerDashboard | ☐ | ☐ | ☐ | ☐ | ☐ |
| CoachCreateTeam | ☐ | ☐ | ☐ | ☐ | ☐ |
| JudgeScoring | ☐ | ☐ | ☐ | ☐ | ☐ |
| Home | ☐ | ☐ | ☐ | ☐ | ☐ |
| PublicScores | ☐ | ☐ | ☐ | ☐ | ☐ |
| ForgotPassword | ☐ | ☐ | ☐ | ☐ | ☐ |
| ResetPassword | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## Testing Tools Summary

### Automated Tools
- **axe DevTools**: Browser extension for automated accessibility testing
- **WAVE**: Web accessibility evaluation tool
- **Lighthouse**: Built into Chrome DevTools (Accessibility audit)
- **WebAIM Contrast Checker**: Color contrast testing

### Screen Readers
- **NVDA** (Windows): Free, open-source
- **JAWS** (Windows): Commercial, industry standard
- **VoiceOver** (macOS/iOS): Built-in
- **Orca** (Linux): Free, open-source
- **TalkBack** (Android): Built-in

### Browser DevTools
- **Chrome DevTools**: Accessibility panel, device emulation
- **Firefox DevTools**: Accessibility inspector
- **Edge DevTools**: Accessibility panel

---

## Success Criteria

All tests must pass the following criteria:

### Keyboard Navigation
- ✅ All interactive elements are reachable via Tab key
- ✅ Tab order follows logical reading order
- ✅ Enter/Space keys activate buttons
- ✅ Escape key closes modals/dialogs
- ✅ Focus indicators are visible (3:1 contrast minimum)

### Screen Reader Compatibility
- ✅ All images have appropriate alt text
- ✅ All buttons have accessible names
- ✅ Form errors are announced
- ✅ Semantic HTML structure (headings, landmarks)
- ✅ ARIA labels on icon-only buttons

### Color Contrast
- ✅ Normal text: 4.5:1 minimum
- ✅ Large text: 3:1 minimum
- ✅ Focus indicators: 3:1 minimum
- ✅ No color contrast violations in axe DevTools

### Touch Targets
- ✅ All interactive elements: 44px minimum
- ✅ Adequate spacing between elements (8px minimum)
- ✅ Mobile-friendly on all screen sizes

### Reduced Motion
- ✅ Animations disabled/reduced when prefers-reduced-motion is enabled
- ✅ useReducedMotion hook works correctly
- ✅ Framer Motion respects reduced motion preference
- ✅ Page remains functional without animations

---

## Issue Reporting Template

If any accessibility issues are found, document them using this template:

```
**Issue**: [Brief description]
**Page**: [Page name and route]
**Category**: [Keyboard Nav / Screen Reader / Color Contrast / Touch Targets / Reduced Motion]
**Severity**: [Critical / High / Medium / Low]
**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior**: [What should happen]
**Actual Behavior**: [What actually happens]
**WCAG Criterion**: [e.g., 2.1.1 Keyboard, 1.4.3 Contrast]
**Screenshot**: [If applicable]
```

---

## Completion Checklist

- [ ] All 5 sub-tasks completed (12.1 - 12.5)
- [ ] All pages tested across all 5 categories
- [ ] All issues documented and reported
- [ ] Automated tests passing (axe, Lighthouse)
- [ ] Manual tests completed and verified
- [ ] Test results documented
- [ ] Sign-off obtained from accessibility reviewer

---

**Test Date**: _______________
**Tester Name**: _______________
**Signature**: _______________
