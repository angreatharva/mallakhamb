import { sanitizeInput } from '../utils/sanitize';

/**
 * SafeText component - Displays user-generated content safely
 * Automatically sanitizes text to prevent XSS attacks
 * 
 * @param {string} children - Text content to display
 * @param {string} as - HTML element to render (default: 'span')
 * @param {string} className - CSS classes to apply
 * @param {object} props - Additional props to pass to the element
 */
const SafeText = ({ children, as: Component = 'span', className = '', ...props }) => {
  if (typeof children !== 'string') {
    return <Component className={className} {...props}>{children}</Component>;
  }
  
  const sanitized = sanitizeInput(children);
  
  return (
    <Component className={className} {...props}>
      {sanitized}
    </Component>
  );
};

export default SafeText;
