/**
 * Tests for ARIA Live Region Components
 * 
 * Tests screen reader announcements for dynamic content
 * 
 * **Validates: Requirement 11.5**
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { LiveRegion, ErrorAnnouncement, StatusAnnouncement } from './LiveRegion';

describe('LiveRegion', () => {
  /**
   * **Validates: Requirement 11.5**
   * ARIA live regions should announce dynamic content to screen readers
   */
  it('should render with polite aria-live by default', () => {
    const { container } = render(
      <LiveRegion>Test announcement</LiveRegion>
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('role', 'status');
  });

  it('should render with assertive aria-live when specified', () => {
    const { container } = render(
      <LiveRegion politeness="assertive">Urgent announcement</LiveRegion>
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'assertive');
  });

  it('should render with alert role when specified', () => {
    const { container } = render(
      <LiveRegion role="alert">Error message</LiveRegion>
    );
    
    const region = container.querySelector('[role="alert"]');
    expect(region).toBeInTheDocument();
  });

  it('should have aria-atomic attribute', () => {
    const { container } = render(
      <LiveRegion atomic={true}>Test announcement</LiveRegion>
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('should be visually hidden but accessible to screen readers', () => {
    const { container } = render(
      <LiveRegion>Test announcement</LiveRegion>
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).toHaveClass('sr-only');
  });

  it('should not render when children is null', () => {
    const { container } = render(
      <LiveRegion>{null}</LiveRegion>
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).not.toBeInTheDocument();
  });

  it('should update content when children changes', () => {
    const { container, rerender } = render(
      <LiveRegion>First message</LiveRegion>
    );
    
    let region = container.querySelector('[aria-live]');
    expect(region).toHaveTextContent('First message');
    
    rerender(<LiveRegion>Second message</LiveRegion>);
    
    region = container.querySelector('[aria-live]');
    expect(region).toHaveTextContent('Second message');
  });
});

describe('ErrorAnnouncement', () => {
  /**
   * **Validates: Requirement 11.5**
   * Error messages should be announced assertively to screen readers
   */
  it('should render error with assertive politeness', () => {
    const { container } = render(
      <ErrorAnnouncement error="Email is required" />
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveAttribute('role', 'alert');
    expect(region).toHaveTextContent('Email is required');
  });

  it('should not render when error is null', () => {
    const { container } = render(
      <ErrorAnnouncement error={null} />
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).not.toBeInTheDocument();
  });

  it('should not render when error is empty string', () => {
    const { container } = render(
      <ErrorAnnouncement error="" />
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).not.toBeInTheDocument();
  });

  it('should update when error message changes', () => {
    const { container, rerender } = render(
      <ErrorAnnouncement error="First error" />
    );
    
    let region = container.querySelector('[aria-live]');
    expect(region).toHaveTextContent('First error');
    
    rerender(<ErrorAnnouncement error="Second error" />);
    
    region = container.querySelector('[aria-live]');
    expect(region).toHaveTextContent('Second error');
  });
});

describe('StatusAnnouncement', () => {
  /**
   * **Validates: Requirement 11.5**
   * Status messages should be announced politely to screen readers
   */
  it('should render status with polite politeness', () => {
    const { container } = render(
      <StatusAnnouncement message="Form submitted successfully" />
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveTextContent('Form submitted successfully');
  });

  it('should not render when message is null', () => {
    const { container } = render(
      <StatusAnnouncement message={null} />
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).not.toBeInTheDocument();
  });

  it('should not render when message is empty string', () => {
    const { container } = render(
      <StatusAnnouncement message="" />
    );
    
    const region = container.querySelector('[aria-live]');
    expect(region).not.toBeInTheDocument();
  });

  it('should update when message changes', () => {
    const { container, rerender } = render(
      <StatusAnnouncement message="Loading..." />
    );
    
    let region = container.querySelector('[aria-live]');
    expect(region).toHaveTextContent('Loading...');
    
    rerender(<StatusAnnouncement message="Loaded successfully" />);
    
    region = container.querySelector('[aria-live]');
    expect(region).toHaveTextContent('Loaded successfully');
  });
});

describe('Form Error Announcements Integration', () => {
  /**
   * **Validates: Requirement 11.5**
   * Form validation errors should be announced to screen readers
   */
  it('should announce form validation errors', () => {
    const { container } = render(
      <div>
        <input type="email" aria-describedby="email-error" />
        <div id="email-error" role="alert" aria-live="polite">
          Email is required
        </div>
      </div>
    );
    
    const errorMessage = container.querySelector('[role="alert"]');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent('Email is required');
  });

  it('should associate error with input using aria-describedby', () => {
    const { container } = render(
      <div>
        <input type="email" aria-describedby="email-error" />
        <div id="email-error" role="alert">
          Email is required
        </div>
      </div>
    );
    
    const input = container.querySelector('input');
    const errorMessage = container.querySelector('[role="alert"]');
    
    expect(input).toHaveAttribute('aria-describedby', 'email-error');
    expect(errorMessage).toHaveAttribute('id', 'email-error');
  });
});
