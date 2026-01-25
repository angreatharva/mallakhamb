import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../utils/cn";
import { useResponsive } from "../../hooks/useResponsive";

const alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const getRandomInt = (max) => Math.floor(Math.random() * max);

export default function HyperText({
    text,
    duration = 800,
    framerProps = {
        initial: { opacity: 0, y: -10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 3 },
    },
    className,
    animateOnLoad = true,
}) {
    const [displayText, setDisplayText] = useState(text.split(""));
    const [trigger, setTrigger] = useState(false);
    const interations = useRef(0);
    const isFirstRender = useRef(true);
    const { isMobile, isTablet, getResponsiveValue } = useResponsive();

    // Get responsive duration based on viewport
    const getResponsiveDuration = () => {
        return getResponsiveValue({
            mobile: duration * 0.8, // Faster on mobile for better UX
            tablet: duration * 0.9,
            desktop: duration
        });
    };

    // Get responsive animation properties
    const getResponsiveFramerProps = () => {
        const baseDuration = getResponsiveDuration();
        
        return getResponsiveValue({
            mobile: {
                initial: { opacity: 0, y: -5 }, // Reduced movement on mobile
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, y: 2 },
                transition: { duration: baseDuration / 1000 }
            },
            tablet: {
                initial: { opacity: 0, y: -8 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, y: 2.5 },
                transition: { duration: baseDuration / 1000 }
            },
            desktop: {
                ...framerProps,
                transition: { duration: baseDuration / 1000 }
            }
        });
    };

    const triggerAnimation = () => {
        interations.current = 0;
        setTrigger(true);
    };

    useEffect(() => {
        const responsiveDuration = getResponsiveDuration();
        
        const interval = setInterval(() => {
            if (!animateOnLoad && isFirstRender.current) {
                clearInterval(interval);
                isFirstRender.current = false;
                return;
            }
            if (interations.current < text.length) {
                setDisplayText((t) =>
                    t.map((l, i) =>
                        l === " "
                            ? l
                            : i <= interations.current
                                ? text[i]
                                : alphabets[getRandomInt(26)],
                    ),
                );
                interations.current = interations.current + 0.1;
            } else {
                setTrigger(false);
                clearInterval(interval);
            }
        }, responsiveDuration / (text.length * 10));
        // Clean up interval on unmount
        return () => clearInterval(interval);
    }, [text, getResponsiveDuration, trigger, animateOnLoad]);

    // Get responsive container classes
    const getContainerClasses = () => {
        const baseClasses = "overflow-hidden py-2 flex cursor-default scale-100";
        
        return getResponsiveValue({
            mobile: `${baseClasses} touch-manipulation`, // Better touch performance
            tablet: baseClasses,
            desktop: baseClasses
        });
    };

    // Get responsive letter spacing
    const getLetterSpacing = () => {
        return getResponsiveValue({
            mobile: "w-2", // Tighter spacing on mobile
            tablet: "w-2.5",
            desktop: "w-3"
        });
    };

    // Get responsive font classes
    const getResponsiveFontClasses = () => {
        const baseFontClasses = "font-mono";
        
        return getResponsiveValue({
            mobile: `${baseFontClasses} text-sm sm:text-base`, // Responsive text sizing
            tablet: `${baseFontClasses} text-base md:text-lg`,
            desktop: `${baseFontClasses} text-lg`
        });
    };

    const responsiveFramerProps = getResponsiveFramerProps();

    return (
        <div
            className={getContainerClasses()}
            onMouseEnter={triggerAnimation}
            onTouchStart={isMobile ? triggerAnimation : undefined} // Touch support for mobile
        >
            <AnimatePresence mode="wait">
                {displayText.map((letter, i) => (
                    <motion.h1
                        key={i}
                        className={cn(
                            getResponsiveFontClasses(),
                            letter === " " ? getLetterSpacing() : "",
                            className
                        )}
                        {...responsiveFramerProps}
                    >
                        {letter.toUpperCase()}
                    </motion.h1>
                ))}
            </AnimatePresence>
        </div>
    );
}
