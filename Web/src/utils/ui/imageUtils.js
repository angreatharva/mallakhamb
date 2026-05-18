/**
 * Image Utilities for Responsive Design
 * 
 * Provides utilities for responsive image handling, optimization,
 * and aspect ratio management across different viewport sizes.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

/**
 * Generate responsive image sizes attribute
 * @param {Object} options - Configuration options
 * @param {string} options.mobile - Mobile viewport size (default: '100vw')
 * @param {string} options.tablet - Tablet viewport size (default: '50vw')
 * @param {string} options.desktop - Desktop viewport size (default: '33vw')
 * @returns {string} Sizes attribute string
 */
export const generateResponsiveSizes = (options = {}) => {
  const {
    mobile = '100vw',
    tablet = '50vw',
    desktop = '33vw'
  } = options;
  
  return `(max-width: 768px) ${mobile}, (max-width: 1024px) ${tablet}, ${desktop}`;
};

/**
 * Generate srcset for responsive images
 * @param {string} baseSrc - Base image source URL
 * @param {Array} widths - Array of image widths to generate
 * @returns {string} Srcset attribute string
 */
export const generateSrcSet = (baseSrc, widths = [320, 640, 768, 1024, 1280, 1920]) => {
  if (!baseSrc.includes('unsplash.com') && !baseSrc.includes('placeholder')) {
    // For local images, return the base source
    return baseSrc;
  }
  
  // For external images (like Unsplash), generate different sizes
  return widths
    .map(width => `${baseSrc}&w=${width} ${width}w`)
    .join(', ');
};

/**
 * Get optimal image dimensions for viewport
 * @param {string} viewport - Viewport category ('mobile', 'tablet', 'desktop')
 * @param {string} imageType - Image type ('hero', 'card', 'avatar', 'gallery')
 * @returns {Object} Optimal dimensions
 */
export const getOptimalImageDimensions = (viewport, imageType) => {
  const dimensions = {
    hero: {
      mobile: { width: 375, height: 250 },
      tablet: { width: 768, height: 400 },
      desktop: { width: 1920, height: 800 }
    },
    card: {
      mobile: { width: 300, height: 200 },
      tablet: { width: 350, height: 250 },
      desktop: { width: 400, height: 300 }
    },
    avatar: {
      mobile: { width: 64, height: 64 },
      tablet: { width: 80, height: 80 },
      desktop: { width: 96, height: 96 }
    },
    gallery: {
      mobile: { width: 300, height: 300 },
      tablet: { width: 400, height: 400 },
      desktop: { width: 500, height: 500 }
    }
  };
  
  return dimensions[imageType]?.[viewport] || dimensions.card[viewport];
};

/**
 * Calculate aspect ratio from dimensions
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} Aspect ratio string (e.g., '16/9')
 */
export const calculateAspectRatio = (width, height) => {
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  return `${width / divisor}/${height / divisor}`;
};

/**
 * Get responsive image classes based on usage context
 * @param {string} context - Usage context ('hero', 'card', 'avatar', 'gallery', 'content')
 * @param {string} viewport - Current viewport category
 * @returns {string} CSS classes string
 */
export const getResponsiveImageClasses = (context, viewport) => {
  const baseClasses = 'responsive-img';
  
  const contextClasses = {
    hero: 'responsive-img-hero object-cover w-full',
    card: 'responsive-img-card object-cover rounded-lg',
    avatar: 'responsive-img-avatar object-cover rounded-full',
    gallery: 'responsive-img object-cover hover:scale-105 transition-transform duration-300',
    content: 'responsive-img object-contain mx-auto'
  };
  
  const viewportClasses = {
    mobile: 'max-w-full',
    tablet: 'max-w-full',
    desktop: 'max-w-full'
  };
  
  return [
    baseClasses,
    contextClasses[context] || contextClasses.content,
    viewportClasses[viewport] || viewportClasses.mobile
  ].join(' ');
};

/**
 * Optimize image URL for responsive loading
 * @param {string} src - Original image source
 * @param {Object} options - Optimization options
 * @param {number} options.width - Target width
 * @param {number} options.height - Target height
 * @param {string} options.format - Target format ('webp', 'jpg', 'png')
 * @param {number} options.quality - Image quality (1-100)
 * @returns {string} Optimized image URL
 */
export const optimizeImageUrl = (src, options = {}) => {
  const { width, height, format = 'webp', quality = 80 } = options;
  
  // Handle Unsplash URLs
  if (src.includes('unsplash.com')) {
    const params = new URLSearchParams();
    if (width) params.set('w', width);
    if (height) params.set('h', height);
    if (format) params.set('fm', format);
    if (quality) params.set('q', quality);
    params.set('fit', 'crop');
    params.set('crop', 'smart');
    
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}${params.toString()}`;
  }
  
  // For local images, return as-is (could be enhanced with build-time optimization)
  return src;
};

/**
 * Preload critical images for performance
 * @param {Array} imageSources - Array of image sources to preload
 * @param {string} viewport - Current viewport for optimization
 */
export const preloadCriticalImages = (imageSources, viewport = 'desktop') => {
  if (typeof window === 'undefined') return;
  
  imageSources.forEach(src => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    
    // Optimize the source for current viewport
    const optimizedSrc = optimizeImageUrl(src, {
      width: viewport === 'mobile' ? 375 : viewport === 'tablet' ? 768 : 1200,
      format: 'webp'
    });
    
    link.href = optimizedSrc;
    document.head.appendChild(link);
  });
};

/**
 * Lazy load images with intersection observer
 * @param {HTMLElement} imageElement - Image element to lazy load
 * @param {Object} options - Intersection observer options
 */
export const lazyLoadImage = (imageElement, options = {}) => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    // Fallback for browsers without IntersectionObserver
    if (imageElement.dataset.src) {
      imageElement.src = imageElement.dataset.src;
    }
    return;
  }
  
  const defaultOptions = {
    root: null,
    rootMargin: '50px',
    threshold: 0.1,
    ...options
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.classList.remove('image-loading');
          img.classList.add('fade-in');
        }
        observer.unobserve(img);
      }
    });
  }, defaultOptions);
  
  observer.observe(imageElement);
};

/**
 * Validate image aspect ratio for responsive design
 * @param {HTMLImageElement} imageElement - Image element to validate
 * @param {string} expectedRatio - Expected aspect ratio (e.g., '16/9')
 * @returns {boolean} Whether the image matches the expected ratio
 */
export const validateImageAspectRatio = (imageElement, expectedRatio) => {
  if (!imageElement.naturalWidth || !imageElement.naturalHeight) {
    return false;
  }
  
  const actualRatio = calculateAspectRatio(
    imageElement.naturalWidth, 
    imageElement.naturalHeight
  );
  
  return actualRatio === expectedRatio;
};

/**
 * Generate responsive image configuration for common use cases
 * @param {string} useCase - Use case ('hero', 'gallery', 'profile', 'thumbnail')
 * @returns {Object} Complete responsive image configuration
 */
export const getResponsiveImageConfig = (useCase) => {
  const configs = {
    hero: {
      aspectRatio: '16/9',
      sizes: generateResponsiveSizes({ mobile: '100vw', tablet: '100vw', desktop: '100vw' }),
      objectFit: 'cover',
      priority: true,
      widths: [375, 768, 1024, 1440, 1920]
    },
    gallery: {
      aspectRatio: '1/1',
      sizes: generateResponsiveSizes({ mobile: '50vw', tablet: '33vw', desktop: '25vw' }),
      objectFit: 'cover',
      priority: false,
      widths: [200, 300, 400, 500, 600]
    },
    profile: {
      aspectRatio: '1/1',
      sizes: generateResponsiveSizes({ mobile: '80px', tablet: '100px', desktop: '120px' }),
      objectFit: 'cover',
      priority: false,
      widths: [80, 100, 120, 160, 200]
    },
    thumbnail: {
      aspectRatio: '4/3',
      sizes: generateResponsiveSizes({ mobile: '100px', tablet: '150px', desktop: '200px' }),
      objectFit: 'cover',
      priority: false,
      widths: [100, 150, 200, 250, 300]
    }
  };
  
  return configs[useCase] || configs.gallery;
};

/**
 * Handle image loading errors with fallback
 * @param {HTMLImageElement} imageElement - Image element that failed to load
 * @param {string} fallbackSrc - Fallback image source
 */
export const handleImageError = (imageElement, fallbackSrc) => {
  if (imageElement.src !== fallbackSrc) {
    imageElement.src = fallbackSrc;
  } else {
    // Show error placeholder
    imageElement.style.display = 'none';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'image-error aspect-video bg-gray-100 flex items-center justify-center';
    errorDiv.innerHTML = `
      <div class="text-center text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p class="text-sm">Image not available</p>
      </div>
    `;
    imageElement.parentNode.insertBefore(errorDiv, imageElement);
  }
};

export default {
  generateResponsiveSizes,
  generateSrcSet,
  getOptimalImageDimensions,
  calculateAspectRatio,
  getResponsiveImageClasses,
  optimizeImageUrl,
  preloadCriticalImages,
  lazyLoadImage,
  validateImageAspectRatio,
  getResponsiveImageConfig,
  handleImageError
};