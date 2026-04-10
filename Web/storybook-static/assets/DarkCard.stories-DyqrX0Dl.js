import{R as l,C as g,j as s,P as e}from"./iframe-B6P-JI9O.js";import{u as k}from"./useTheme-2R4gOSi3.js";import{u as C}from"./useResponsive-DRC15Gv5.js";import"./preload-helper-PPVm8Dsz.js";const n=({children:t,className:h="",style:d={},hover:a=!1,padding:i})=>{const p=k(),{getResponsiveValue:b}=C(),[o,m]=l.useState(!1),v=i?b(i):"md",c={sm:"1rem",md:"1.5rem",lg:"2rem"},u=c[v]||c.md,y=l.useMemo(()=>({...g.cardBase,border:`1px solid ${o&&a?p.colors.primary:"rgba(255, 255, 255, 0.06)"}`,padding:u,...g.transitionAll,transform:o&&a?"translateY(-2px)":"translateY(0)",...d}),[o,a,p.colors.primary,u,d]);return s.jsx("div",{className:`dark-card ${h}`,style:y,onMouseEnter:()=>a&&m(!0),onMouseLeave:()=>a&&m(!1),children:t})};n.propTypes={children:e.node.isRequired,className:e.string,style:e.object,hover:e.bool,padding:e.oneOfType([e.string,e.shape({mobile:e.string,tablet:e.string,desktop:e.string})])};n.defaultProps={className:"",style:{},hover:!1,padding:null};const f=l.memo(n);n.__docgenInfo={description:`DarkCard - A card component with dark glassmorphism styling

Features:
- Dark glassmorphism background
- Subtle border with role-specific accent on hover
- Optional hover animation
- Support for custom className and style props
- Memoized for performance optimization
- Optimized with shared style objects

@param {Object} props
@param {React.ReactNode} props.children - Card content
@param {string} props.className - Additional CSS classes
@param {React.CSSProperties} props.style - Additional inline styles
@param {boolean} props.hover - Enable hover animation
@param {object|string} [props.padding] - Responsive padding values (e.g., { mobile: 'sm', desktop: 'lg' } or 'md')

@example
<DarkCard hover>
  <h2>Card Title</h2>
  <p>Card content goes here</p>
</DarkCard>

@example
<DarkCard padding={{ mobile: 'sm', desktop: 'lg' }}>
  <p>Responsive padding card</p>
</DarkCard>

**Validates: Requirements 4.2, 4.5, 4.6, 4.7, 10.3, 10.5, 15.1, 15.5**`,methods:[],displayName:"DarkCardComponent",props:{className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},style:{defaultValue:{value:"{}",computed:!1},description:"",type:{name:"object"},required:!1},hover:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1},padding:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"shape",value:{mobile:{name:"string",required:!1},tablet:{name:"string",required:!1},desktop:{name:"string",required:!1}}}]},required:!1},children:{description:"",type:{name:"node"},required:!0}}};const S={title:"Design System/Cards/DarkCard",component:f,argTypes:{hover:{control:"boolean"},className:{control:!1},style:{control:!1},padding:{control:!1},children:{control:!1}}},r={args:{hover:!0},render:t=>s.jsxs(f,{...t,children:[s.jsx("h3",{className:"text-lg font-semibold",children:"Dark card"}),s.jsx("p",{className:"mt-2 text-white/70",children:"Hover to see the role-accent border and subtle lift."})]})};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    hover: true
  },
  render: args => <DarkCard {...args}>\r
      <h3 className="text-lg font-semibold">Dark card</h3>\r
      <p className="mt-2 text-white/70">Hover to see the role-accent border and subtle lift.</p>\r
    </DarkCard>
}`,...r.parameters?.docs?.source}}};const j=["Default"];export{r as Default,j as __namedExportsOrder,S as default};
