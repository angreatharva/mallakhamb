import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { useResponsive } from "../../hooks/useResponsive";

export const PixelImage = ({
    src,
    pixelSize = 20,
    className,
    aspectRatio,
    objectFit = 'cover',
    alt = '',
    loading = 'lazy',
    ...props
}) => {
    const canvasRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const { isMobile, isTablet, getResponsiveValue } = useResponsive();

    // Enhanced responsive pixel size calculation
    const getResponsivePixelSize = () => {
        return getResponsiveValue({
            mobile: Math.max(Math.floor(pixelSize * 0.6), 8), // Smaller pixels for mobile
            tablet: Math.max(Math.floor(pixelSize * 0.8), 12),
            desktop: pixelSize
        });
    };

    // Enhanced responsive container sizing
    const getResponsiveCanvasSize = (img, containerRect) => {
        const maxWidth = getResponsiveValue({
            mobile: Math.min(containerRect?.width || 300, window.innerWidth - 32), // Account for padding
            tablet: Math.min(containerRect?.width || 500, window.innerWidth - 64),
            desktop: containerRect?.width || img.width
        });

        let canvasWidth = maxWidth;
        let canvasHeight;

        if (aspectRatio) {
            // Parse aspect ratio more robustly
            const [widthRatio, heightRatio] = aspectRatio.includes('/') ? 
                aspectRatio.split('/').map(Number) : 
                aspectRatio.includes(':') ?
                aspectRatio.split(':').map(Number) :
                [parseFloat(aspectRatio), 1];
            
            canvasHeight = canvasWidth * (heightRatio / widthRatio);
        } else {
            canvasHeight = (img.height / img.width) * canvasWidth;
        }

        return { width: canvasWidth, height: canvasHeight };
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || hasError) return;
        
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.src = src;
        img.crossOrigin = "Anonymous";

        img.onload = () => {
            try {
                // Enhanced responsive canvas sizing
                const containerRect = canvas.parentElement?.getBoundingClientRect();
                const { width: canvasWidth, height: canvasHeight } = getResponsiveCanvasSize(img, containerRect);
                
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;

                setIsLoaded(true);
                setHasError(false);

                const responsivePixelSize = getResponsivePixelSize();

                if (isHovered) {
                    // Draw original image with enhanced quality
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    if (objectFit === 'cover') {
                        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
                        const x = (canvas.width - img.width * scale) / 2;
                        const y = (canvas.height - img.height * scale) / 2;
                        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                    } else if (objectFit === 'contain') {
                        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                        const x = (canvas.width - img.width * scale) / 2;
                        const y = (canvas.height - img.height * scale) / 2;
                        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                    } else {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    }
                } else {
                    // Enhanced pixelation effect with better performance
                    const w = canvas.width;
                    const h = canvas.height;

                    // Calculate scaled dimensions with minimum pixel size
                    const scaledW = Math.max(Math.ceil(w / responsivePixelSize), 1);
                    const scaledH = Math.max(Math.ceil(h / responsivePixelSize), 1);

                    // Turn off smoothing for pixelation effect
                    ctx.imageSmoothingEnabled = false;
                    ctx.clearRect(0, 0, w, h);

                    // Create temporary canvas for scaling with better memory management
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCanvas.width = scaledW;
                    tempCanvas.height = scaledH;
                    tempCtx.imageSmoothingEnabled = false;

                    // Draw image to temp canvas at small size
                    if (objectFit === 'cover') {
                        const scale = Math.max(scaledW / img.width, scaledH / img.height);
                        const x = (scaledW - img.width * scale) / 2;
                        const y = (scaledH - img.height * scale) / 2;
                        tempCtx.drawImage(img, x, y, img.width * scale, img.height * scale);
                    } else if (objectFit === 'contain') {
                        const scale = Math.min(scaledW / img.width, scaledH / img.height);
                        const x = (scaledW - img.width * scale) / 2;
                        const y = (scaledH - img.height * scale) / 2;
                        tempCtx.drawImage(img, x, y, img.width * scale, img.height * scale);
                    } else {
                        tempCtx.drawImage(img, 0, 0, scaledW, scaledH);
                    }

                    // Draw scaled up version back to main canvas
                    ctx.drawImage(tempCanvas, 0, 0, scaledW, scaledH, 0, 0, w, h);
                }
            } catch (error) {
                console.error('Error rendering pixel image:', error);
                setHasError(true);
                setIsLoaded(false);
            }
        };

        img.onerror = (error) => {
            console.error('Error loading image:', error);
            setIsLoaded(false);
            setHasError(true);
        };
    }, [src, getResponsivePixelSize, isHovered, aspectRatio, objectFit, hasError, getResponsiveCanvasSize]);

    // Enhanced responsive container classes
    const getContainerClasses = () => {
        const baseClasses = ['responsive-pixel-image-container', 'relative', 'overflow-hidden'];
        
        if (aspectRatio) {
            // Support multiple aspect ratio formats
            const aspectClass = aspectRatio.includes('/') || aspectRatio.includes(':') ? 
                `aspect-[${aspectRatio.replace(':', '/')}]` : 
                `aspect-[${aspectRatio}]`;
            baseClasses.push(aspectClass);
        }
        
        // Enhanced responsive sizing
        const responsiveClasses = getResponsiveValue({
            mobile: ['max-w-full', 'w-full', 'min-h-[200px]'],
            tablet: ['max-w-full', 'w-full', 'min-h-[250px]'],
            desktop: ['max-w-full', 'w-full']
        });
        
        baseClasses.push(...responsiveClasses);
        
        return baseClasses.join(' ');
    };

    // Enhanced responsive canvas classes
    const getCanvasClasses = () => {
        const baseClasses = "w-full h-full max-w-full transition-all duration-300 cursor-pointer";
        
        const interactionClasses = getResponsiveValue({
            mobile: "active:scale-[0.98] touch-manipulation", // Touch-friendly interactions
            tablet: "hover:scale-[1.02] transform-gpu",
            desktop: "hover:scale-105 transform-gpu"
        });
        
        const visibilityClasses = isLoaded && !hasError ? "opacity-100" : "opacity-0";
        
        return cn(baseClasses, interactionClasses, visibilityClasses, className);
    };

    // Enhanced loading placeholder
    const LoadingPlaceholder = () => (
        <div className={cn(
            "absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center",
            getResponsiveValue({
                mobile: "min-h-[200px]",
                tablet: "min-h-[250px]", 
                desktop: "min-h-[300px]"
            })
        )}>
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
        </div>
    );

    // Enhanced error placeholder
    const ErrorPlaceholder = () => (
        <div className={cn(
            "absolute inset-0 bg-gray-100 flex items-center justify-center text-gray-500",
            getResponsiveValue({
                mobile: "min-h-[200px] text-sm",
                tablet: "min-h-[250px] text-base",
                desktop: "min-h-[300px] text-base"
            })
        )}>
            <div className="text-center">
                <div className="text-2xl mb-2">⚠️</div>
                <div>Failed to load image</div>
            </div>
        </div>
    );

    // Enhanced touch and mouse event handlers
    const handleInteractionStart = () => {
        setIsHovered(true);
    };

    const handleInteractionEnd = () => {
        setIsHovered(false);
    };

    return (
        <div className={getContainerClasses()}>
            {/* Loading placeholder */}
            {!isLoaded && !hasError && <LoadingPlaceholder />}
            
            {/* Error placeholder */}
            {hasError && <ErrorPlaceholder />}
            
            <canvas
                ref={canvasRef}
                className={getCanvasClasses()}
                onMouseEnter={handleInteractionStart}
                onMouseLeave={handleInteractionEnd}
                onTouchStart={handleInteractionStart}
                onTouchEnd={handleInteractionEnd}
                onTouchCancel={handleInteractionEnd}
                role="img"
                aria-label={alt || 'Pixel effect image'}
                {...props}
            />
        </div>
    );
};

export default PixelImage;
