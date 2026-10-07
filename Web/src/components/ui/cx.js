/** Join class names, skipping falsy ones. (No tailwind-merge: primitives own their visuals.) */
export const cx = (...names) => names.filter(Boolean).join(' ');
