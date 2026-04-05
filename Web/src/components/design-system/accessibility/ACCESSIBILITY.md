# Accessibility Guidelines

This document outlines the accessibility features and compliance standards for the Mallakhamb Design System.

## WCAG AA Compliance

All components in the design system are built to meet WCAG 2.1 Level AA standards.

### Requirements Validated

- **11.1**: All interactive elements have minimum 44px touch targets
- **11.2**: ARIA labels for all icon-only buttons
- **11.3**: Keyboard navigation for all interactive components
- **11.4**: Focus indicators with 3:1 contrast ratio
- **11.5**: Error announcements for screen readers
- **11.6**: Color contrast ratios meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- **11.7**: Support for prefers-reduced-motion
- **11.8**: Proper HTML semantics and form labels

## Touch Targets

All interactive elements (buttons, inputs, links) have a minimum touch target size of 44px × 44px to ensure they are easily tappable on mobile devices.

### Implementation

```jsx
// All form components include min-h-[44px]
<ThemedButton>Click me</ThemedButton>
<ThemedInput placeholder="Enter text" />
<ThemedSelect options={[...]} />
```

### Testing

Run touch target tests:
```bash
npm test -- accessibility.test.jsx --run
```

## ARIA Labels

### Icon-Only Buttons

All icon-only buttons must have `aria-label` attributes to provide accessible names for screen reader users.

#### Good Examples

```jsx
// Close button with aria-label
<button aria-label="Close dialog">
  <X className="w-4 h-4" aria-hidden="true" />
</button>

// Icon button with aria-label
<ThemedButton icon={Plus} aria-label="Add item" />

// Password toggle with dynamic aria-label
<button 
  aria-label={showPassword ? 'Hide password' : 'Show password'}
  onClick={togglePassword}
>
  {showPassword ? <EyeOff /> : <Eye />}
</button>
```

#### Bad Examples

```jsx
// ❌ Missing aria-label
<button>
  <X className="w-4 h-4" />
</button>

// ❌ Icon not hidden from screen readers
<button aria-label="Close">
  <X className="w-4 h-4" />
</button>
```

### Decorative Icons

Icons that are purely decorative or accompany text should have `aria-hidden="true"` to prevent screen readers from announcing them.

```jsx
// Button with text and icon
<ThemedButton icon={Plus}>
  Add Item
</ThemedButton>

// Icon is automatically hidden with aria-hidden="true"
```

## Keyboard Navigation

All interactive components are fully keyboard accessible.

### Tab Order

Focus order follows the logical reading order (left-to-right, top-to-bottom).

```jsx
// Form with logical tab order
<form>
  <ThemedInput placeholder="Name" />      {/* Tab stop 1 */}
  <ThemedInput placeholder="Email" />     {/* Tab stop 2 */}
  <ThemedSelect options={[...]} />        {/* Tab stop 3 */}
  <ThemedButton type="submit">Submit</ThemedButton> {/* Tab stop 4 */}
</form>
```

### Keyboard Shortcuts

- **Tab**: Move focus forward
- **Shift + Tab**: Move focus backward
- **Enter**: Activate buttons, submit forms
- **Space**: Activate buttons
- **Escape**: Close modals, clear inputs
- **Arrow Keys**: Navigate select dropdowns

### Testing

Run keyboard navigation tests:
```bash
npm test -- keyboard-navigation.test.jsx --run
```

## Focus Indicators

All interactive elements have visible focus indicators with sufficient contrast (3:1 ratio).

### Implementation

```jsx
// ThemedButton includes focus ring
<ThemedButton>Click me</ThemedButton>
// Renders with: focus:ring-3 and role-specific color

// ThemedInput includes focus styling
<ThemedInput placeholder="Enter text" />
// Renders with: focus:border-current and focus shadow
```

### Focus Styles

- **Buttons**: 3px ring with role-specific color
- **Inputs**: Border color change + 3px shadow
- **Links**: Underline + color change
- **Custom elements**: Visible outline or border

## Screen Reader Support

### ARIA Live Regions

Use ARIA live regions to announce dynamic content changes to screen readers.

#### LiveRegion Component

```jsx
import { LiveRegion, ErrorAnnouncement, StatusAnnouncement } from './accessibility';

// Polite announcement (non-urgent)
<LiveRegion politeness="polite" role="status">
  Form submitted successfully
</LiveRegion>

// Assertive announcement (urgent)
<LiveRegion politeness="assertive" role="alert">
  Error: Email is required
</LiveRegion>
```

#### Specialized Components

```jsx
// Error announcements (assertive)
<ErrorAnnouncement error="Email is required" />

// Status announcements (polite)
<StatusAnnouncement message="Saving..." />
```

### Form Validation Errors

Form validation errors are automatically announced to screen readers.

```jsx
// ThemedInput with error
<ThemedInput 
  placeholder="Email"
  error="Email is required"
/>
// Renders with: role="alert" aria-live="polite"
```

### Testing

Run screen reader announcement tests:
```bash
npm test -- LiveRegion.test.jsx --run
```

## Color Contrast

All text meets WCAG AA contrast ratios:

- **Normal text** (< 18pt): 4.5:1 contrast ratio
- **Large text** (≥ 18pt): 3:1 contrast ratio
- **Focus indicators**: 3:1 contrast ratio

### Role Colors

All role-specific colors have been tested for sufficient contrast:

- **Admin/Judge** (Purple #8B5CF6): ✓ Passes AA
- **SuperAdmin** (Gold #F5A623): ✓ Passes AA
- **Coach** (Green #22C55E): ✓ Passes AA
- **Player** (Saffron #FF6B00): ✓ Passes AA
- **Public** (Blue #3B82F6): ✓ Passes AA

### Error States

Error colors (Red #EF4444) meet WCAG AA standards for both normal and large text.

## Reduced Motion

All animations respect the `prefers-reduced-motion` user preference.

### Implementation

```jsx
import { useReducedMotion } from './animations';

const MyComponent = () => {
  const shouldReduceMotion = useReducedMotion();
  
  return (
    <motion.div
      animate={shouldReduceMotion ? {} : { scale: [1, 1.05, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      Content
    </motion.div>
  );
};
```

### Components with Reduced Motion Support

- **FadeIn**: Disables slide animations
- **TiltCard**: Disables tilt effects
- **Background decorations**: Renders static versions
- **GradientText**: Disables gradient animation
- **Ornaments**: Disables rotation and pulsing

## Form Labels

All form inputs must have associated labels using proper HTML semantics.

### Good Examples

```jsx
// Explicit label association
<div>
  <label htmlFor="email-input">Email</label>
  <ThemedInput id="email-input" type="email" />
</div>

// Implicit label association
<label>
  Email
  <ThemedInput type="email" />
</label>

// aria-label for inputs without visible labels
<ThemedInput 
  type="search" 
  placeholder="Search..."
  aria-label="Search players"
/>
```

### Bad Examples

```jsx
// ❌ Input without label
<ThemedInput type="email" placeholder="Email" />

// ❌ Label not associated with input
<label>Email</label>
<ThemedInput type="email" />
```

## Testing Accessibility

### Automated Tests

Run the full accessibility test suite:

```bash
# All accessibility tests
npm test -- accessibility --run

# Specific test suites
npm test -- accessibility.test.jsx --run
npm test -- keyboard-navigation.test.jsx --run
npm test -- LiveRegion.test.jsx --run
```

### Manual Testing

#### Screen Readers

Test with the following screen readers:

- **Windows**: NVDA (free), JAWS
- **macOS**: VoiceOver (built-in)
- **iOS**: VoiceOver (built-in)
- **Android**: TalkBack (built-in)

#### Keyboard Navigation

1. Disconnect mouse/trackpad
2. Navigate entire application using only keyboard
3. Verify all interactive elements are reachable
4. Verify focus indicators are visible
5. Verify logical tab order

#### Color Contrast

Use browser extensions or online tools:

- **Chrome**: Lighthouse DevTools
- **Firefox**: Accessibility Inspector
- **Online**: WebAIM Contrast Checker

#### Reduced Motion

1. Enable reduced motion in OS settings:
   - **Windows**: Settings > Ease of Access > Display > Show animations
   - **macOS**: System Preferences > Accessibility > Display > Reduce motion
   - **iOS**: Settings > Accessibility > Motion > Reduce Motion
   - **Android**: Settings > Accessibility > Remove animations

2. Verify animations are disabled or simplified

## Common Patterns

### Modal Dialogs

```jsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Dialog Title</h2>
  <p id="dialog-description">Dialog description</p>
  
  <button aria-label="Close dialog">
    <X aria-hidden="true" />
  </button>
</div>
```

### Loading States

```jsx
// Button with loading state
<ThemedButton loading={isLoading}>
  {isLoading ? 'Loading...' : 'Submit'}
</ThemedButton>

// Announce loading state
<StatusAnnouncement message={isLoading ? 'Loading...' : null} />
```

### Error Messages

```jsx
// Input with error
<div>
  <label htmlFor="email">Email</label>
  <ThemedInput 
    id="email"
    type="email"
    error={errors.email}
    aria-describedby={errors.email ? 'email-error' : undefined}
  />
  {errors.email && (
    <div id="email-error" role="alert" aria-live="polite">
      {errors.email}
    </div>
  )}
</div>
```

### Skip Links

```jsx
// Add skip link at top of page
<a 
  href="#main-content" 
  className="sr-only focus:not-sr-only"
>
  Skip to main content
</a>

// Main content area
<main id="main-content">
  {/* Page content */}
</main>
```

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [NVDA Screen Reader](https://www.nvaccess.org/)
- [axe DevTools](https://www.deque.com/axe/devtools/)

## Support

For accessibility questions or issues, please:

1. Check this documentation
2. Run automated tests
3. Test with screen readers
4. Consult WCAG guidelines
5. Ask for help in team discussions

## Disclaimer

While we strive for full WCAG AA compliance, automated tests cannot catch all accessibility issues. Manual testing with assistive technologies and expert accessibility review is recommended for production applications.

**Note**: We cannot claim that code is fully WCAG compliant without comprehensive manual testing with assistive technologies and expert accessibility review.
