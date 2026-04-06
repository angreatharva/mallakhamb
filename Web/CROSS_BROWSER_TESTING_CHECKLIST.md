# Cross-Browser and Mobile Testing Checklist

**Spec**: Pages Folder Refactoring - Task 13  
**Purpose**: Practical checklist for manual cross-browser and mobile testing

---

## Setup Instructions

### 1. Start Development Server
```bash
cd Web
npm run dev
```

### 2. Access Application
- Local: http://localhost:5173
- Network: http://[your-ip]:5173 (for mobile device testing)

### 3. Test Credentials
Use existing test accounts or create new ones for each role.

---

## 13.1 Desktop Browser Testing

### Chrome (Latest)

#### Authentication Flows
- [ ] Admin login at `/admin/login`
- [ ] SuperAdmin login at `/superadmin/login`
- [ ] Coach login at `/coach/login`
- [ ] Player login at `/player/login`
- [ ] Judge login at `/judge/login`
- [ ] Coach registration at `/coach/register`
- [ ] Player registration at `/player/register`
- [ ] Forgot password flow
- [ ] Reset password flow
- [ ] Logout functionality

#### Navigation
- [ ] All routes load correctly
- [ ] Protected routes redirect to login when not authenticated
- [ ] Back button works correctly
- [ ] Forward button works correctly
- [ ] Deep links work (copy/paste URL)
- [ ] Route transitions are smooth

#### Design System Components
- [ ] ThemedInput renders correctly
- [ ] ThemedButton renders correctly
- [ ] GlassCard styling is correct
- [ ] DarkCard styling is correct
- [ ] Background components render (HexGrid, RadialBurst, HexMesh)
- [ ] Modal dialogs work correctly
- [ ] Toast notifications appear and dismiss
- [ ] Loading spinners display

#### Role-Specific Features
- [ ] Admin: Competition selection works
- [ ] Admin: Team management interface
- [ ] Admin: Judge assignment
- [ ] SuperAdmin: System stats display
- [ ] SuperAdmin: Admin management
- [ ] Coach: Team creation wizard
- [ ] Coach: Competition selection
- [ ] Coach: Payment processing
- [ ] Player: Team selection
- [ ] Player: Dashboard displays correctly
- [ ] Judge: Scoring interface loads
- [ ] Judge: Real-time score updates

#### Console Check
- [ ] No JavaScript errors in console
- [ ] No network errors (except expected 401s)
- [ ] No React warnings

---

### Firefox (Latest)

Repeat all Chrome tests:
- [ ] Authentication flows
- [ ] Navigation
- [ ] Design system components
- [ ] Role-specific features
- [ ] Console check

**Firefox-Specific Checks:**
- [ ] CSS Grid layouts work correctly
- [ ] Flexbox layouts work correctly
- [ ] WebSocket connections stable
- [ ] LocalStorage works correctly

---

### Safari (Latest - macOS)

Repeat all Chrome tests:
- [ ] Authentication flows
- [ ] Navigation
- [ ] Design system components
- [ ] Role-specific features
- [ ] Console check

**Safari-Specific Checks:**
- [ ] WebKit-specific CSS renders correctly
- [ ] Backdrop-filter effects work (or fallback gracefully)
- [ ] Date inputs work correctly
- [ ] WebSocket connections stable

---

### Edge (Latest)

Repeat all Chrome tests:
- [ ] Authentication flows
- [ ] Navigation
- [ ] Design system components
- [ ] Role-specific features
- [ ] Console check

**Edge-Specific Checks:**
- [ ] Chromium compatibility confirmed
- [ ] No Edge-specific rendering issues

---

## 13.2 Mobile Browser Testing

### Mobile Safari (iOS)

#### Setup
1. Connect iPhone/iPad to same network as dev server
2. Navigate to http://[your-ip]:5173
3. Add to home screen for app-like experience (optional)

#### Touch Interactions
- [ ] All buttons are tappable (44px minimum)
- [ ] Form inputs open keyboard correctly
- [ ] Dropdown menus work
- [ ] Links are tappable
- [ ] No accidental taps on nearby elements

#### Authentication Flows
- [ ] Admin login works
- [ ] Coach login works
- [ ] Player login works
- [ ] Judge login works
- [ ] SuperAdmin login works
- [ ] Coach registration works
- [ ] Player registration works

#### Mobile-Specific UI
- [ ] Navigation adapts to mobile (hamburger menu if applicable)
- [ ] Cards stack vertically
- [ ] Forms use full width
- [ ] No horizontal scrolling
- [ ] Text is readable without zooming

#### iOS-Specific Checks
- [ ] Date inputs work (iOS has specific styling)
- [ ] iOS keyboard doesn't cover inputs
- [ ] Safe area insets respected (notch devices)
- [ ] Smooth scrolling
- [ ] No layout shifts

#### Performance
- [ ] Pages load quickly
- [ ] Smooth scrolling
- [ ] No janky animations
- [ ] Touch response is immediate

---

### Chrome Mobile (Android)

#### Setup
1. Connect Android device to same network as dev server
2. Navigate to http://[your-ip]:5173
3. Add to home screen for app-like experience (optional)

#### Touch Interactions
- [ ] All buttons are tappable (44px minimum)
- [ ] Form inputs open keyboard correctly
- [ ] Dropdown menus work
- [ ] Links are tappable
- [ ] No accidental taps on nearby elements

#### Authentication Flows
- [ ] Admin login works
- [ ] Coach login works
- [ ] Player login works
- [ ] Judge login works
- [ ] SuperAdmin login works
- [ ] Coach registration works
- [ ] Player registration works

#### Mobile-Specific UI
- [ ] Navigation adapts to mobile
- [ ] Cards stack vertically
- [ ] Forms use full width
- [ ] No horizontal scrolling
- [ ] Text is readable without zooming

#### Android-Specific Checks
- [ ] Material Design inputs work well
- [ ] Android keyboard doesn't cover inputs
- [ ] Back button works correctly
- [ ] Smooth scrolling
- [ ] No layout shifts

#### Performance
- [ ] Pages load quickly
- [ ] Smooth scrolling
- [ ] No janky animations
- [ ] Touch response is immediate

---

## 13.3 Responsive Design Testing

### Mobile (< 768px)

#### Test Viewports
- [ ] 320px width (iPhone SE)
- [ ] 375px width (iPhone 12/13)
- [ ] 414px width (iPhone Pro Max)

#### Layout Checks
- [ ] Single column layouts
- [ ] Navigation is mobile-friendly
- [ ] Cards stack vertically
- [ ] Forms use full width
- [ ] Touch targets are 44px minimum
- [ ] No horizontal scrolling
- [ ] Text is readable

#### Pages to Test
- [ ] UnifiedLogin (all roles)
- [ ] UnifiedRegister (coach, player)
- [ ] UnifiedDashboard (admin, superadmin)
- [ ] UnifiedCompetitionSelection (coach, player)
- [ ] CoachDashboard
- [ ] PlayerDashboard
- [ ] JudgeScoring
- [ ] Home
- [ ] PublicScores

---

### Tablet (768px - 1024px)

#### Test Viewports
- [ ] 768px width (iPad portrait)
- [ ] 1024px width (iPad landscape)

#### Layout Checks
- [ ] 2-column grid layouts
- [ ] Navigation is condensed but accessible
- [ ] Cards display in 2-column grid
- [ ] Forms use 2-column layout where appropriate
- [ ] Touch targets remain 44px minimum
- [ ] Content is well-spaced

#### Pages to Test
- [ ] UnifiedLogin (all roles)
- [ ] UnifiedRegister (coach, player)
- [ ] UnifiedDashboard (admin, superadmin)
- [ ] UnifiedCompetitionSelection (coach, player)
- [ ] CoachDashboard
- [ ] PlayerDashboard
- [ ] JudgeScoring
- [ ] Home
- [ ] PublicScores

---

### Desktop (> 1024px)

#### Test Viewports
- [ ] 1280px width (standard laptop)
- [ ] 1440px width (desktop baseline)
- [ ] 1920px width (full HD)

#### Layout Checks
- [ ] Multi-column layouts (3-4 columns)
- [ ] Full navigation displayed
- [ ] Cards display in grid (3-4 columns)
- [ ] Forms use side-by-side layouts
- [ ] Hover states work correctly
- [ ] Content is optimized for large screens

#### Pages to Test
- [ ] UnifiedLogin (all roles)
- [ ] UnifiedRegister (coach, player)
- [ ] UnifiedDashboard (admin, superadmin)
- [ ] UnifiedCompetitionSelection (coach, player)
- [ ] CoachDashboard
- [ ] PlayerDashboard
- [ ] JudgeScoring
- [ ] AdminTeams
- [ ] AdminScores
- [ ] AdminJudges
- [ ] Home
- [ ] PublicScores

---

### Orientation Testing

#### Portrait
- [ ] Mobile: All layouts adapt correctly
- [ ] Tablet: All layouts adapt correctly
- [ ] Content stacks vertically
- [ ] No layout breaks

#### Landscape
- [ ] Mobile: Content reflows appropriately
- [ ] Tablet: Content reflows appropriately
- [ ] Wider content areas utilized
- [ ] No layout breaks

#### Orientation Change
- [ ] No layout breaks during rotation
- [ ] Content reflows smoothly
- [ ] useResponsive hook detects changes
- [ ] No data loss during rotation

---

## Browser DevTools Testing

### Chrome DevTools

1. Open DevTools (F12)
2. Click "Toggle device toolbar" (Ctrl+Shift+M)
3. Select device presets or custom dimensions

#### Responsive Mode Testing
- [ ] Test all breakpoints (320px, 768px, 1024px, 1440px)
- [ ] Test orientation changes
- [ ] Test touch simulation
- [ ] Check network throttling (3G, 4G)

#### Performance Testing
- [ ] Run Lighthouse audit
- [ ] Check Performance score (target: 90+)
- [ ] Check Accessibility score (target: 95+)
- [ ] Check Best Practices score
- [ ] Check SEO score

#### Console Monitoring
- [ ] No errors during navigation
- [ ] No warnings (or only expected warnings)
- [ ] No failed network requests (except expected 401s)

---

### Firefox DevTools

1. Open DevTools (F12)
2. Click "Responsive Design Mode" (Ctrl+Shift+M)
3. Select device presets or custom dimensions

#### Responsive Mode Testing
- [ ] Test all breakpoints
- [ ] Test orientation changes
- [ ] Check CSS Grid inspector
- [ ] Check Flexbox inspector

---

### Safari DevTools

1. Enable Develop menu (Safari > Preferences > Advanced)
2. Open Web Inspector (Cmd+Option+I)
3. Use Responsive Design Mode

#### Responsive Mode Testing
- [ ] Test all breakpoints
- [ ] Test iOS device presets
- [ ] Check WebKit-specific features

---

## Accessibility Testing

### Keyboard Navigation
- [ ] Tab key navigates through all interactive elements
- [ ] Enter/Space activates buttons
- [ ] Escape closes modals
- [ ] Arrow keys work in dropdowns
- [ ] Focus indicators are visible (3:1 contrast)

### Screen Reader Testing
- [ ] All images have alt text
- [ ] All buttons have labels
- [ ] Form errors are announced
- [ ] Page titles are descriptive
- [ ] Landmarks are properly labeled

### Color Contrast
- [ ] Normal text: 4.5:1 contrast ratio
- [ ] Large text: 3:1 contrast ratio
- [ ] Focus indicators: 3:1 contrast ratio
- [ ] Use browser extensions to verify (e.g., axe DevTools)

### Touch Targets
- [ ] All interactive elements are 44px minimum
- [ ] Adequate spacing between touch targets
- [ ] No overlapping touch areas

---

## Performance Testing

### Page Load Times
- [ ] Home page: < 2s
- [ ] Login pages: < 2s
- [ ] Dashboard pages: < 2.5s
- [ ] All other pages: < 2s

### Network Performance
- [ ] Test on 3G network (throttled)
- [ ] Test on 4G network (throttled)
- [ ] Test on WiFi
- [ ] Check bundle sizes

### Real-Time Performance
- [ ] WebSocket connections establish quickly
- [ ] Real-time updates are immediate
- [ ] No lag in judge scoring interface
- [ ] Dashboard updates smoothly

---

## Issue Tracking Template

When you find an issue, document it:

```markdown
### Issue: [Brief Description]

**Browser**: [Chrome/Firefox/Safari/Edge/Mobile Safari/Chrome Mobile]
**Device**: [Desktop/iPhone/iPad/Android]
**Viewport**: [Width x Height]
**Severity**: [Critical/High/Medium/Low]

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**:


**Actual Behavior**:


**Screenshots**:
[Attach screenshots if applicable]

**Console Errors**:
[Copy any console errors]

**Status**: [Open/In Progress/Resolved]
```

---

## Sign-Off

### Desktop Browsers
- [ ] Chrome - Tested by: __________ Date: __________
- [ ] Firefox - Tested by: __________ Date: __________
- [ ] Safari - Tested by: __________ Date: __________
- [ ] Edge - Tested by: __________ Date: __________

### Mobile Browsers
- [ ] Mobile Safari - Tested by: __________ Date: __________
- [ ] Chrome Mobile - Tested by: __________ Date: __________

### Responsive Design
- [ ] Mobile (< 768px) - Tested by: __________ Date: __________
- [ ] Tablet (768px - 1024px) - Tested by: __________ Date: __________
- [ ] Desktop (> 1024px) - Tested by: __________ Date: __________

### Final Approval
- [ ] All critical issues resolved
- [ ] All browsers tested and working
- [ ] All responsive breakpoints validated
- [ ] Performance targets met
- [ ] Accessibility requirements met

**Approved by**: __________ **Date**: __________

---

## Notes

- This checklist should be completed for each major release
- Document all issues found, even if they're minor
- Take screenshots of any visual issues
- Test with real devices when possible (not just DevTools)
- Consider using BrowserStack for testing on more device/browser combinations
