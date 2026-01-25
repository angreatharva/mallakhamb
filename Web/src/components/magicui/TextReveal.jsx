import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { cn } from "../../utils/cn";
import { useResponsive } from "../../hooks/useResponsive";

export const TextReveal = ({ text, className }) => {
    const targetRef = useRef(null);
    const { isMobile, isTablet, getResponsiveValue } = useResponsive();

    // Adjust scroll offset for mobile devices (shorter viewport)
    const getScrollOffset = () => {
        return getResponsiveValue({
            mobile: ["start 0.7", "end 0.3"], // More aggressive reveal on mobile
            tablet: ["start 0.6", "end 0.4"],
            desktop: ["start 0.5", "end 0.5"]
        });
    };

    const { scrollYProgress } = useScroll({
        target: targetRef,
        offset: getScrollOffset(),
    });

    const words = text.split(" ");

    // Get responsive container height
    const getContainerHeight = () => {
        return getResponsiveValue({
            mobile: "h-[150vh]", // Shorter on mobile for better UX
            tablet: "h-[175vh]",
            desktop: "h-[200vh]"
        });
    };

    // Get responsive sticky positioning
    const getStickyClasses = () => {
        return getResponsiveValue({
            mobile: "sticky top-0 mx-auto flex h-[60%] max-w-full items-center bg-transparent px-4 py-8",
            tablet: "sticky top-0 mx-auto flex h-[55%] max-w-3xl items-center bg-transparent px-6 py-12",
            desktop: "sticky top-0 mx-auto flex h-[50%] max-w-4xl items-center bg-transparent px-[1rem] py-[5rem]"
        });
    };

    // Get responsive text classes
    const getTextClasses = () => {
        return getResponsiveValue({
            mobile: "flex flex-wrap p-3 text-lg font-bold text-black/20 leading-relaxed",
            tablet: "flex flex-wrap p-4 text-xl font-bold text-black/20 md:p-6 md:text-2xl leading-relaxed",
            desktop: "flex flex-wrap p-5 text-2xl font-bold text-black/20 md:p-8 md:text-3xl lg:p-10 lg:text-4xl xl:text-5xl"
        });
    };

    return (
        <div ref={targetRef} className={cn("relative z-0", getContainerHeight(), className)}>
            <div className={getStickyClasses()}>
                <p className={getTextClasses()}>
                    {words.map((word, i) => {
                        const start = i / words.length;
                        const end = start + 1 / words.length;
                        return (
                            <Word 
                                key={i} 
                                progress={scrollYProgress} 
                                range={[start, end]}
                                isMobile={isMobile}
                                isTablet={isTablet}
                            >
                                {word}
                            </Word>
                        );
                    })}
                </p>
            </div>
        </div>
    );
};

const Word = ({ children, progress, range, isMobile, isTablet }) => {
    const opacity = useTransform(progress, range, [0, 1]);
    
    // Get responsive spacing classes
    const getSpacingClasses = () => {
        if (isMobile) return "relative mx-0.5 lg:mx-1";
        if (isTablet) return "relative mx-1 lg:mx-1.5";
        return "relative mx-1 lg:mx-2.5";
    };
    
    return (
        <span className={getSpacingClasses()}>
            <span className="absolute opacity-30">{children}</span>
            <motion.span 
                style={{ opacity: opacity }} 
                className="text-black"
            >
                {children}
            </motion.span>
        </span>
    );
};

export default TextReveal;
