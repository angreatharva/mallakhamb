import{j as e,D as i,P as r}from"./iframe-B6P-JI9O.js";import{u as o}from"./useReducedMotion-B8214p5W.js";import"./preload-helper-PPVm8Dsz.js";const s=({color:t=i.colors.brand.saffron,opacity:a=.03,className:n=""})=>(o(),e.jsx("div",{className:`absolute inset-0 pointer-events-none overflow-hidden ${n}`,style:{zIndex:0},"aria-hidden":"true",children:e.jsxs("svg",{width:"100%",height:"100%",xmlns:"http://www.w3.org/2000/svg",style:{opacity:a},children:[e.jsx("defs",{children:e.jsxs("pattern",{id:"hexgrid",x:"0",y:"0",width:"56",height:"100",patternUnits:"userSpaceOnUse",children:[e.jsx("path",{d:"M28 0 L42 8 L42 24 L28 32 L14 24 L14 8 Z",fill:"none",stroke:t,strokeWidth:"1"}),e.jsx("path",{d:"M0 50 L14 58 L14 74 L0 82 L-14 74 L-14 58 Z",fill:"none",stroke:t,strokeWidth:"1"}),e.jsx("path",{d:"M56 50 L70 58 L70 74 L56 82 L42 74 L42 58 Z",fill:"none",stroke:t,strokeWidth:"1"})]})}),e.jsx("rect",{width:"100%",height:"100%",fill:"url(#hexgrid)"})]})}));s.propTypes={color:r.string,opacity:r.number,className:r.string};s.__docgenInfo={description:`HexGrid - SVG-based hexagonal pattern background decoration

Renders a non-interactive hexagonal grid pattern that respects user motion preferences.
Positioned absolutely and designed to not interfere with content readability.

@param {Object} props
@param {string} props.color - Hex color for the pattern (default: saffron)
@param {number} props.opacity - Opacity value 0-1 (default: 0.03)
@param {string} props.className - Additional CSS classes

@example
<HexGrid color="#8B5CF6" opacity={0.05} />`,methods:[],displayName:"HexGrid",props:{color:{defaultValue:{value:"'#FF6B00'",computed:!1},description:"",type:{name:"string"},required:!1},opacity:{defaultValue:{value:"0.03",computed:!1},description:"",type:{name:"number"},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1}}};export{s as default};
