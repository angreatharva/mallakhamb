import{R as p,C as i,j as a,P as e}from"./iframe-B6P-JI9O.js";import{u as f}from"./useResponsive-DRC15Gv5.js";import"./preload-helper-PPVm8Dsz.js";const r=({children:t,className:c="",style:n={},padding:o})=>{const{getResponsiveValue:u}=f(),g=o?u(o):"md",l={sm:"1rem",md:"1.5rem",lg:"2rem"},d=l[g]||l.md,h=p.useMemo(()=>({...i.glassCard,padding:d,...i.transitionAll,...n}),[d,n]);return a.jsx("div",{className:`glass-card ${c}`,style:h,children:t})};r.propTypes={children:e.node.isRequired,className:e.string,style:e.object,padding:e.oneOfType([e.string,e.shape({mobile:e.string,tablet:e.string,desktop:e.string})])};r.defaultProps={className:"",style:{},padding:null};const m=p.memo(r);r.__docgenInfo={description:`GlassCard - A card component with glassmorphism styling

Features:
- Backdrop blur effect for glassmorphism
- Consistent border radius and shadows
- Responsive behavior on mobile devices
- Support for custom className and style props
- Optimized with shared style objects

@param {Object} props
@param {React.ReactNode} props.children - Card content
@param {string} props.className - Additional CSS classes
@param {React.CSSProperties} props.style - Additional inline styles
@param {object|string} [props.padding] - Responsive padding values

@example
<GlassCard>
  <h2>Card Title</h2>
  <p>Card content goes here</p>
</GlassCard>

**Validates: Requirements 4.1, 4.5, 4.6, 4.7, 10.5, 15.1, 15.5**`,methods:[],displayName:"GlassCardComponent",props:{className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},style:{defaultValue:{value:"{}",computed:!1},description:"",type:{name:"object"},required:!1},padding:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"shape",value:{mobile:{name:"string",required:!1},tablet:{name:"string",required:!1},desktop:{name:"string",required:!1}}}]},required:!1},children:{description:"",type:{name:"node"},required:!0}}};const v={title:"Design System/Cards/GlassCard",component:m,argTypes:{className:{control:!1},style:{control:!1},padding:{control:!1},children:{control:!1}}},s={render:t=>a.jsxs(m,{...t,children:[a.jsx("h3",{className:"text-lg font-semibold",children:"Glass card"}),a.jsx("p",{className:"mt-2 text-white/70",children:"Use this for elevated content blocks where you want a lighter glassmorphism treatment."})]})};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: args => <GlassCard {...args}>\r
      <h3 className="text-lg font-semibold">Glass card</h3>\r
      <p className="mt-2 text-white/70">\r
        Use this for elevated content blocks where you want a lighter glassmorphism treatment.\r
      </p>\r
    </GlassCard>
}`,...s.parameters?.docs?.source}}};const N=["Default"];export{s as Default,N as __namedExportsOrder,v as default};
