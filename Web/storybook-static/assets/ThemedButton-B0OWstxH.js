import{c as u}from"./createLucideIcon-D8jzYoXh.js";import{r as w,j as n,P as e}from"./iframe-B6P-JI9O.js";import{c as s}from"./clsx-B-dksMZM.js";import{u as N}from"./useTheme-2R4gOSi3.js";import{u as B}from"./useResponsive-DRC15Gv5.js";import{m as q}from"./proxy-Dci2HvBq.js";const V=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],R=u("loader-circle",V);const z=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],I=u("plus",z),l=w.forwardRef(({variant:c="solid",size:h="md",loading:i,icon:r,className:f,disabled:g,padding:d,children:y,...v},b)=>{const o=N(),{getResponsiveValue:x}=B(),a=g||i,t=d?x(d):h,T={sm:"px-3 py-2 text-sm min-h-[44px]",md:"px-4 py-3 text-base min-h-[44px]",lg:"px-6 py-4 text-lg min-h-[44px]"},p=(()=>{const m={solid:{className:s("text-white font-medium",!a&&"hover:opacity-90"),style:{backgroundColor:o.colors.primary}},outline:{className:s("bg-transparent font-medium border-2",!a&&"hover:bg-white/5"),style:{color:o.colors.primary,borderColor:o.colors.primary}},ghost:{className:s("bg-transparent font-medium",!a&&"hover:bg-white/5"),style:{color:o.colors.primary}}};return m[c]||m.solid})();return n.jsxs(q.button,{ref:b,disabled:a,className:s("inline-flex items-center justify-center gap-2","rounded-lg transition-all duration-200","outline-none focus:ring-3",T[t],p.className,a&&["opacity-50","cursor-not-allowed","pointer-events-none"],f),style:p.style,whileHover:a?{}:{scale:1.02},whileTap:a?{}:{scale:.98},whileFocus:{boxShadow:`0 0 0 3px ${o.colors.primaryLight}`},...v,children:[i&&n.jsx(R,{className:s("animate-spin",t==="sm"&&"w-4 h-4",t==="md"&&"w-5 h-5",t==="lg"&&"w-6 h-6"),"aria-hidden":"true"}),!i&&r&&n.jsx(r,{className:s(t==="sm"&&"w-4 h-4",t==="md"&&"w-5 h-5",t==="lg"&&"w-6 h-6"),"aria-hidden":"true"}),y]})});l.displayName="ThemedButton";l.propTypes={variant:e.oneOf(["solid","outline","ghost"]),size:e.oneOf(["sm","md","lg"]),loading:e.bool,icon:e.elementType,className:e.string,disabled:e.bool,padding:e.oneOfType([e.string,e.shape({mobile:e.string,tablet:e.string,desktop:e.string})]),children:e.node.isRequired};l.defaultProps={variant:"solid",size:"md",loading:!1,icon:null,className:"",disabled:!1,padding:null};l.__docgenInfo={description:`ThemedButton - A themed button component that adapts to the current role context

Features:
- Variants: solid, outline, ghost
- Sizes: sm, md, lg
- Loading state with spinner
- Icon support
- Minimum 44px touch target
- Disabled state

@param {Object} props
@param {'solid'|'outline'|'ghost'} [props.variant='solid'] - Button variant
@param {'sm'|'md'|'lg'} [props.size='md'] - Button size
@param {boolean} [props.loading] - Loading state
@param {React.ComponentType} [props.icon] - Icon component
@param {string} [props.className] - Additional CSS classes
@param {boolean} [props.disabled] - Disabled state
@param {object|string} [props.padding] - Responsive padding values
@param {React.ReactNode} props.children - Button content

@example
<ThemedButton variant="solid" size="md">
  Submit
</ThemedButton>

@example
<ThemedButton variant="outline" icon={Plus} loading={isLoading}>
  Add Item
</ThemedButton>

@example
<ThemedButton padding={{ mobile: 'sm', desktop: 'lg' }}>
  Responsive Button
</ThemedButton>

**Validates: Requirements 3.4, 3.8, 15.1, 15.5**`,methods:[],displayName:"ThemedButton",props:{variant:{defaultValue:{value:"'solid'",computed:!1},description:"",type:{name:"enum",value:[{value:"'solid'",computed:!1},{value:"'outline'",computed:!1},{value:"'ghost'",computed:!1}]},required:!1},size:{defaultValue:{value:"'md'",computed:!1},description:"",type:{name:"enum",value:[{value:"'sm'",computed:!1},{value:"'md'",computed:!1},{value:"'lg'",computed:!1}]},required:!1},loading:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1},icon:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"elementType"},required:!1},className:{defaultValue:{value:"''",computed:!1},description:"",type:{name:"string"},required:!1},disabled:{defaultValue:{value:"false",computed:!1},description:"",type:{name:"bool"},required:!1},padding:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"shape",value:{mobile:{name:"string",required:!1},tablet:{name:"string",required:!1},desktop:{name:"string",required:!1}}}]},required:!1},children:{description:"",type:{name:"node"},required:!0}}};export{I as P,l as T};
