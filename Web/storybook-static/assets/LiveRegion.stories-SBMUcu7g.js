import{r as u,j as e,P as t}from"./iframe-B6P-JI9O.js";import"./preload-helper-PPVm8Dsz.js";const s=({children:r,politeness:o="polite",role:n="status",atomic:a=!0,clearOnUnmount:m=!0})=>{const p=u.useRef(null);return u.useEffect(()=>()=>{m&&p.current&&(p.current.textContent="")},[m]),r?e.jsx("div",{ref:p,role:n,"aria-live":o,"aria-atomic":a,className:"sr-only",children:r}):null};s.propTypes={children:t.node,politeness:t.oneOf(["polite","assertive","off"]),role:t.oneOf(["status","alert","log"]),atomic:t.bool,clearOnUnmount:t.bool};s.defaultProps={children:null,politeness:"polite",role:"status",atomic:!0,clearOnUnmount:!0};const c=({error:r})=>r?e.jsx(s,{politeness:"assertive",role:"alert",children:r}):null;c.propTypes={error:t.oneOfType([t.string,t.node])};c.defaultProps={error:null};const d=({message:r})=>r?e.jsx(s,{politeness:"polite",role:"status",children:r}):null;d.propTypes={message:t.oneOfType([t.string,t.node])};d.defaultProps={message:null};s.__docgenInfo={description:`LiveRegion - ARIA live region for screen reader announcements

Provides accessible announcements for dynamic content changes,
particularly useful for error messages and status updates.

@param {Object} props
@param {React.ReactNode} props.children - Content to announce
@param {'polite'|'assertive'|'off'} [props.politeness='polite'] - ARIA live politeness level
@param {'status'|'alert'|'log'} [props.role='status'] - ARIA role
@param {boolean} [props.atomic=true] - Whether to announce entire region or just changes
@param {boolean} [props.clearOnUnmount=true] - Clear announcement when component unmounts

@example
// Polite announcement for status updates
<LiveRegion politeness="polite" role="status">
  Form submitted successfully
</LiveRegion>

@example
// Assertive announcement for errors
<LiveRegion politeness="assertive" role="alert">
  Error: Email is required
</LiveRegion>

**Validates: Requirement 11.5**`,methods:[],displayName:"LiveRegion",props:{politeness:{defaultValue:{value:"'polite'",computed:!1},description:"",type:{name:"enum",value:[{value:"'polite'",computed:!1},{value:"'assertive'",computed:!1},{value:"'off'",computed:!1}]},required:!1},role:{defaultValue:{value:"'status'",computed:!1},description:"",type:{name:"enum",value:[{value:"'status'",computed:!1},{value:"'alert'",computed:!1},{value:"'log'",computed:!1}]},required:!1},atomic:{defaultValue:{value:"true",computed:!1},description:"",type:{name:"bool"},required:!1},clearOnUnmount:{defaultValue:{value:"true",computed:!1},description:"",type:{name:"bool"},required:!1},children:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"node"},required:!1}}};c.__docgenInfo={description:`ErrorAnnouncement - Specialized live region for error messages

Uses assertive politeness and alert role for immediate announcement
of error messages to screen reader users.

@param {Object} props
@param {string|React.ReactNode} props.error - Error message to announce

@example
<ErrorAnnouncement error="Email is required" />

**Validates: Requirement 11.5**`,methods:[],displayName:"ErrorAnnouncement",props:{error:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"node"}]},required:!1}}};d.__docgenInfo={description:`StatusAnnouncement - Specialized live region for status updates

Uses polite politeness and status role for non-urgent announcements
that don't interrupt the user's current activity.

@param {Object} props
@param {string|React.ReactNode} props.message - Status message to announce

@example
<StatusAnnouncement message="Form submitted successfully" />

**Validates: Requirement 11.5**`,methods:[],displayName:"StatusAnnouncement",props:{message:{defaultValue:{value:"null",computed:!1},description:"",type:{name:"union",value:[{name:"string"},{name:"node"}]},required:!1}}};const f={title:"Design System/Accessibility/LiveRegion",component:s,argTypes:{politeness:{control:{type:"select"},options:["polite","assertive","off"]},role:{control:{type:"select"},options:["status","alert","log"]},atomic:{control:"boolean"},clearOnUnmount:{control:"boolean"},children:{control:{type:"text"}}}},l={args:{politeness:"polite",role:"status",atomic:!0,clearOnUnmount:!0,children:"Background sync complete"},render:r=>e.jsxs("div",{className:"space-y-4",children:[e.jsx("div",{className:"text-white/70",children:"This renders a screen-reader-only live region. Use the Accessibility addon panel to inspect ARIA."}),e.jsx(s,{...r}),e.jsxs("div",{className:"rounded-lg border border-white/10 bg-white/5 p-4",children:["Visible content (live region is ",e.jsx("span",{className:"font-mono",children:"sr-only"}),")."]})]})},i={render:()=>{const[r,o]=u.useState("Ready"),[n,a]=u.useState(null);return e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"flex gap-3",children:[e.jsx("button",{className:"px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10",onClick:()=>{a(null),o("Saved successfully")},type:"button",children:"Trigger status"}),e.jsx("button",{className:"px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10",onClick:()=>{o("Ready"),a("Network error: please retry")},type:"button",children:"Trigger error"})]}),e.jsxs("div",{className:"rounded-lg border border-white/10 bg-white/5 p-4",children:[e.jsxs("div",{className:"text-white/70",children:["Status: ",r]}),e.jsxs("div",{className:"text-white/70",children:["Error: ",n||"—"]})]}),e.jsx(d,{message:r}),e.jsx(c,{error:n})]})}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    politeness: 'polite',
    role: 'status',
    atomic: true,
    clearOnUnmount: true,
    children: 'Background sync complete'
  },
  render: args => <div className="space-y-4">\r
      <div className="text-white/70">\r
        This renders a screen-reader-only live region. Use the Accessibility addon panel to inspect\r
        ARIA.\r
      </div>\r
      <LiveRegion {...args} />\r
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">\r
        Visible content (live region is <span className="font-mono">sr-only</span>).\r
      </div>\r
    </div>
}`,...l.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  render: () => {
    const [status, setStatus] = useState('Ready');
    const [error, setError] = useState(null);
    return <div className="space-y-4">\r
        <div className="flex gap-3">\r
          <button className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10" onClick={() => {
          setError(null);
          setStatus('Saved successfully');
        }} type="button">\r
            Trigger status\r
          </button>\r
          <button className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10" onClick={() => {
          setStatus('Ready');
          setError('Network error: please retry');
        }} type="button">\r
            Trigger error\r
          </button>\r
        </div>\r
\r
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">\r
          <div className="text-white/70">Status: {status}</div>\r
          <div className="text-white/70">Error: {error || '—'}</div>\r
        </div>\r
\r
        <StatusAnnouncement message={status} />\r
        <ErrorAnnouncement error={error} />\r
      </div>;
  }
}`,...i.parameters?.docs?.source}}};const h=["CustomLiveRegion","StatusAndErrorHelpers"];export{l as CustomLiveRegion,i as StatusAndErrorHelpers,h as __namedExportsOrder,f as default};
