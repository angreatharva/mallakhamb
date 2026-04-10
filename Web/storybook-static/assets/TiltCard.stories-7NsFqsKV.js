import{R as e,j as a,P as r}from"./iframe-B6P-JI9O.js";import{u as j}from"./useReducedMotion-B8214p5W.js";import{m as w}from"./proxy-Dci2HvBq.js";import"./preload-helper-PPVm8Dsz.js";const o=({children:n,className:g="",style:d={},maxTilt:i=10})=>{const l=j(),[x,m]=e.useState(0),[b,p]=e.useState(0),T=e.useCallback(c=>{if(l)return;const t=c.currentTarget.getBoundingClientRect(),M=c.clientX-t.left,N=c.clientY-t.top,u=t.width/2,f=t.height/2,R=(N-f)/f*i,S=(M-u)/u*-i;m(R),p(S)},[l,i]),y=e.useCallback(()=>{m(0),p(0)},[]),C=e.useMemo(()=>({background:"rgba(17, 17, 17, 0.8)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",border:"1px solid rgba(255, 255, 255, 0.06)",borderRadius:"12px",boxShadow:"0 10px 15px rgba(0, 0, 0, 0.1)",padding:"1.5rem",transformStyle:"preserve-3d",...d}),[d]),v=l?{}:{animate:{rotateX:x,rotateY:b},transition:{type:"spring",stiffness:300,damping:30}};return a.jsx(w.div,{className:`tilt-card ${g}`,style:C,onMouseMove:T,onMouseLeave:y,...v,children:n})};o.propTypes={children:r.node.isRequired,className:r.string,style:r.object,maxTilt:r.number};o.defaultProps={className:"",style:{},maxTilt:10};const h=e.memo(o);o.__docgenInfo={description:`TiltCard - A card component with 3D tilt effects

Features:
- 3D tilt effects using framer-motion
- Respects prefers-reduced-motion setting
- Support for custom className and style props
- Smooth hover animations
- Memoized for performance optimization

@param {Object} props
@param {React.ReactNode} props.children - Card content
@param {string} props.className - Additional CSS classes
@param {React.CSSProperties} props.style - Additional inline styles
@param {number} props.maxTilt - Maximum tilt angle in degrees

@example
<TiltCard maxTilt={10}>
  <h2>Card Title</h2>
  <p>Card content goes here</p>
</TiltCard>

**Validates: Requirements 4.4, 4.6, 4.7, 10.3**`,methods:[],displayName:"TiltCardComponent",props:{className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},style:{defaultValue:{value:"{}",computed:!1},description:"",type:{name:"object"},required:!1},maxTilt:{defaultValue:{value:"10",computed:!1},description:"",type:{name:"number"},required:!1},children:{description:"",type:{name:"node"},required:!0}}};const Y={title:"Design System/Cards/TiltCard",component:h,argTypes:{maxTilt:{control:{type:"number",min:0,max:25,step:1}},className:{control:!1},style:{control:!1},children:{control:!1}}},s={args:{maxTilt:10},render:n=>a.jsxs(h,{...n,children:[a.jsx("h3",{className:"text-lg font-semibold",children:"Tilt card"}),a.jsx("p",{className:"mt-2 text-white/70",children:"Move your mouse over the card to see the 3D tilt effect (disabled when reduced motion is on)."})]})};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    maxTilt: 10
  },
  render: args => <TiltCard {...args}>\r
      <h3 className="text-lg font-semibold">Tilt card</h3>\r
      <p className="mt-2 text-white/70">\r
        Move your mouse over the card to see the 3D tilt effect (disabled when reduced motion is\r
        on).\r
      </p>\r
    </TiltCard>
}`,...s.parameters?.docs?.source}}};const P=["Default"];export{s as Default,P as __namedExportsOrder,Y as default};
