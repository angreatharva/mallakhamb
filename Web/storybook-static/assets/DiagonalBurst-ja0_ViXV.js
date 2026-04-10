import{j as s,D as n,P as t}from"./iframe-B6P-JI9O.js";import{u as d}from"./useReducedMotion-B8214p5W.js";import"./preload-helper-PPVm8Dsz.js";const a=({color:o=n.colors.brand.saffron,opacity:r=.08,direction:i="top-left-to-bottom-right",className:l=""})=>{d();const e={"top-left-to-bottom-right":"135deg","top-right-to-bottom-left":"225deg","bottom-left-to-top-right":"45deg","bottom-right-to-top-left":"315deg"},p=e[i]||e["top-left-to-bottom-right"];return s.jsx("div",{className:`absolute inset-0 pointer-events-none ${l}`,style:{background:`linear-gradient(${p}, ${o} 0%, transparent 50%, ${o} 100%)`,opacity:r,zIndex:0},"aria-hidden":"true"})};a.propTypes={color:t.string,opacity:t.number,direction:t.oneOf(["top-left-to-bottom-right","top-right-to-bottom-left","bottom-left-to-top-right","bottom-right-to-top-left"]),className:t.string};a.__docgenInfo={description:`DiagonalBurst - Diagonal gradient background decoration

Renders a diagonal gradient effect that respects user motion preferences.
Positioned absolutely and designed to not interfere with content readability.

@param {Object} props
@param {string} props.color - Hex color for the gradient (default: saffron)
@param {number} props.opacity - Opacity value 0-1 (default: 0.08)
@param {string} props.direction - Gradient direction: 'top-left-to-bottom-right', 'top-right-to-bottom-left', 'bottom-left-to-top-right', 'bottom-right-to-top-left' (default: 'top-left-to-bottom-right')
@param {string} props.className - Additional CSS classes

@example
<DiagonalBurst color="#8B5CF6" direction="top-right-to-bottom-left" opacity={0.1} />`,methods:[],displayName:"DiagonalBurst",props:{color:{defaultValue:{value:"'#FF6B00'",computed:!1},description:"",type:{name:"string"},required:!1},opacity:{defaultValue:{value:"0.08",computed:!1},description:"",type:{name:"number"},required:!1},direction:{defaultValue:{value:"'top-left-to-bottom-right'",computed:!1},description:"",type:{name:"enum",value:[{value:"'top-left-to-bottom-right'",computed:!1},{value:"'top-right-to-bottom-left'",computed:!1},{value:"'bottom-left-to-top-right'",computed:!1},{value:"'bottom-right-to-top-left'",computed:!1}]},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1}}};export{a as default};
