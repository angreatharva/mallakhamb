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
const SafeText = ({ children, as = 'span', className = '', ...props }) => {
  const ElementType = as;
  
  if (typeof children !== 'string') {
    return <ElementType className={className} {...props}>{children}</ElementType>;
  }
  
  const sanitized = sanitizeInput(children);
  
  return (
    <ElementType className={className} {...props}>
      {sanitized}
    </ElementType>
  );
};

export default SafeText;
