/**
 * ResponsiveImage Component
 * 
 * A responsive image component that handles proportional scaling, aspect ratio preservation,
 * and optimized loading across different viewport sizes. Prevents horizontal overflow
 * and maintains image quality across all breakpoints.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import React, { useState, useRef, useEffect } from 'react';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * ResponsiveImage component for adaptive image display
 * @param {Object} props - Component props
 * @param {string} props.src - Image source URL
 * @param {string} props.alt - Alt text for accessibility
 * @param {string} props.aspectRatio - CSS aspect ratio (e.g., '16/9', '4/3', '1/1')
 * @param {string} props.objectFit - CSS object-fit property ('cover', 'contain', 'fill')
 * @param {string} props.objectPosition - CSS object-position property
 * @param {boolean} props.lazy - Enable lazy loading (default: true)
 * @param {string} props.sizes - Responsive sizes attribute
 * @param {string} props.className - Additional CSS classes
 * @param {Function} props.onLoad - Callback when image loads
 * @param {Function} props.onError - Callback when image fails to load
 * @returns {JSX.Element}
 */
export const ResponsiveImage = ({
  src,
  alt = '',
  aspectRatio,
  objectFit = 'cover',
  objectPosition = 'center',
  lazy = true,
  sizes,
  className = '',
  onLoad,
  onError,
  ...props
}) => {
  const { viewport, isMobile, isTablet, isDesktop } = useResponsive();
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  // Handle image load
  const handleLoad = (e) => {
    setIsLoaded(true);
    if (onLoad) onLoad(e);
  };

  // Handle image error
  const handleError = (e) => {
    setHasError(true);
    if (onError) onError(e);
  };

  // Generate responsive sizes attribute if not provided
  const getResponsiveSizes = () => {
    if (sizes) return sizes;
    
    // Default responsive sizes based on common patterns
    return '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw';
  };

  // Generate container classes
  const getContainerClasses = () => {
    const classes = ['responsive-image-container', 'relative', 'overflow-hidden'];
    
    // Add aspect ratio if specified
    if (aspectRatio) {
      classes.push(`aspect-[${aspectRatio}]`);
    }
    
    // Prevent horizontal overflow on mobile
    if (isMobile) {
      classes.push('max-w-full');
    }
    
    return classes.join(' ');
  };

  // Generate image classes
  const getImageClasses = () => {
    const classes = ['responsive-image', 'w-full', 'h-full'];
    
    // Add object-fit and object-position
    classes.push(`object-${objectFit}`);
    if (objectPosition !== 'center') {
      classes.push(`object-${objectPosition}`);
    }
    
    // Add loading state classes
    if (!isLoaded && !hasError) {
      classes.push('opacity-0', 'transition-opacity', 'duration-300');
    } else if (isLoaded) {
      classes.push('opacity-100', 'transition-opacity', 'duration-300');
    }
    
    // Prevent image from causing horizontal scroll
    classes.push('max-w-full', 'h-auto');
    
    return classes.join(' ');
  };

  return (
    <div className={`${getContainerClasses()} ${className}`}>
      {/* Loading placeholder */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
        </div>
      )}
      
      {/* Error placeholder */}
      {hasError && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">Image failed to load</p>
          </div>
        </div>
      )}
      
      {/* Main image */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={getImageClasses()}
        sizes={getResponsiveSizes()}
        loading={lazy ? 'lazy' : 'eager'}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </div>
  );
};

/**
 * ResponsiveHeroImage component for hero sections
 * Optimized for full-width hero displays with proper scaling
 */
export const ResponsiveHeroImage = ({
  src,
  alt = '',
  overlay = true,
  overlayOpacity = 0.6,
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`relative w-full h-full ${className}`}>
      <ResponsiveImage
        src={src}
        alt={alt}
        aspectRatio="16/9"
        objectFit="cover"
        className="absolute inset-0"
        {...props}
      />
      
      {/* Overlay */}
      {overlay && (
        <div 
          className="absolute inset-0 bg-black"
          style={{ opacity: overlayOpacity }}
        />
      )}
      
      {/* Content */}
      {children && (
        <div className="relative z-10 h-full flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * ResponsiveCardImage component for card layouts
 * Maintains consistent aspect ratios in card grids
 */
export const ResponsiveCardImage = ({
  src,
  alt = '',
  aspectRatio = '4/3',
  className = '',
  ...props
}) => {
  return (
    <ResponsiveImage
      src={src}
      alt={alt}
      aspectRatio={aspectRatio}
      objectFit="cover"
      className={`rounded-lg ${className}`}
      {...props}
    />
  );
};

/**
 * ResponsiveGalleryImage component for gallery displays
 * Optimized for gallery layouts with hover effects
 */
export const ResponsiveGalleryImage = ({
  src,
  alt = '',
  aspectRatio = '1/1',
  className = '',
  ...props
}) => {
  return (
    <div className="group cursor-pointer">
      <ResponsiveImage
        src={src}
        alt={alt}
        aspectRatio={aspectRatio}
        objectFit="cover"
        className={`rounded-lg transition-transform duration-300 group-hover:scale-105 ${className}`}
        {...props}
      />
    </div>
  );
};

export default ResponsiveImage;