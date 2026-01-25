import { cn } from "../../utils/cn";
import { useResponsive } from "../../hooks/useResponsive";
import { Link } from "react-router-dom";

export const BentoGrid = ({ className, children }) => {
    const { isMobile, isTablet, getResponsiveValue } = useResponsive();
    
    // Enhanced responsive grid classes with better mobile optimization
    const getGridClasses = () => {
        const baseClasses = "grid max-w-7xl mx-auto";
        
        const gridConfig = getResponsiveValue({
            mobile: "grid-cols-1 gap-3 auto-rows-[14rem]", // Smaller cards on mobile
            tablet: "grid-cols-2 gap-4 auto-rows-[16rem]",
            desktop: "md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4"
        });
        
        return `${baseClasses} ${gridConfig}`;
    };
    
    // Add responsive padding
    const getContainerClasses = () => {
        return getResponsiveValue({
            mobile: "px-4 py-6",
            tablet: "px-6 py-8", 
            desktop: "px-8 py-10"
        });
    };
    
    return (
        <div className={cn(getGridClasses(), getContainerClasses(), className)}>
            {children}
        </div>
    );
};

export const BentoGridItem = ({
    className,
    title,
    description,
    header,
    icon,
    href,
}) => {
    const { isMobile, isTablet, getResponsiveValue } = useResponsive();
    
    // Enhanced responsive typography
    const getTitleClasses = () => {
        return getResponsiveValue({
            mobile: "font-sans font-bold text-neutral-600 mb-2 mt-2 text-sm leading-tight",
            tablet: "font-sans font-bold text-neutral-600 mb-2 mt-2 text-base leading-tight",
            desktop: "font-sans font-bold text-neutral-600 mb-2 mt-2 text-lg"
        });
    };

    const getDescriptionClasses = () => {
        return getResponsiveValue({
            mobile: "font-sans font-normal text-neutral-600 text-xs leading-relaxed",
            tablet: "font-sans font-normal text-neutral-600 text-sm leading-relaxed",
            desktop: "font-sans font-normal text-neutral-600 text-xs"
        });
    };

    // Enhanced responsive spacing and padding
    const getItemPadding = () => {
        return getResponsiveValue({
            mobile: "p-3",
            tablet: "p-4",
            desktop: "p-4"
        });
    };

    // Enhanced responsive spacing between elements
    const getContentSpacing = () => {
        return getResponsiveValue({
            mobile: "space-y-2",
            tablet: "space-y-3",
            desktop: "space-y-4"
        });
    };

    // Enhanced hover and transition effects
    const getHoverClasses = () => {
        return getResponsiveValue({
            mobile: "active:shadow-lg active:scale-[0.98] transition-all duration-200", // Touch feedback
            tablet: "hover:shadow-xl hover:scale-[1.02] transition-all duration-200",
            desktop: "hover:shadow-xl transition duration-200"
        });
    };
    
    const Content = () => (
        <>
            {header}
            <div className={cn(
                "group-hover/bento:translate-x-2 transition duration-200",
                getResponsiveValue({
                    mobile: "group-active/bento:translate-x-1", // Reduced movement on mobile
                    tablet: "group-hover/bento:translate-x-1.5",
                    desktop: "group-hover/bento:translate-x-2"
                })
            )}>
                {icon}
                <div className={getTitleClasses()}>
                    {title}
                </div>
                <div className={getDescriptionClasses()}>
                    {description}
                </div>
            </div>
        </>
    );

    const itemClasses = cn(
        "row-span-1 rounded-xl group/bento bg-white border border-transparent justify-between flex flex-col",
        getItemPadding(),
        getContentSpacing(),
        getHoverClasses(),
        // Enhanced touch targets for mobile
        isMobile && "min-h-[44px] touch-manipulation",
        // Ensure proper aspect ratio maintenance
        "overflow-hidden",
        className
    );

    if (href) {
        return (
            <Link to={href} className={itemClasses}>
                <Content />
            </Link>
        );
    }

    return (
        <div className={itemClasses}>
            <Content />
        </div>
    );
};
