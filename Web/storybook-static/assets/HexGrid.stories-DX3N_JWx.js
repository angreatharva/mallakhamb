import{j as e}from"./iframe-B6P-JI9O.js";import o from"./HexGrid-DnW6yeLY.js";import"./preload-helper-PPVm8Dsz.js";import"./useReducedMotion-B8214p5W.js";const d={title:"Design System/Backgrounds/HexGrid",component:o,argTypes:{color:{control:{type:"color"}},opacity:{control:{type:"number",min:0,max:1,step:.01}},className:{control:!1}}},r={args:{opacity:.05},render:t=>e.jsxs("div",{className:"relative h-64 overflow-hidden rounded-xl border border-white/10 bg-black",children:[e.jsx(o,{...t}),e.jsxs("div",{className:"relative z-10 p-6",children:[e.jsx("div",{className:"text-lg font-semibold",children:"Content on top"}),e.jsx("div",{className:"mt-2 text-white/70",children:"Background components should never block interaction."})]})]})};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    opacity: 0.05
  },
  render: args => <div className="relative h-64 overflow-hidden rounded-xl border border-white/10 bg-black">\r
      <HexGrid {...args} />\r
      <div className="relative z-10 p-6">\r
        <div className="text-lg font-semibold">Content on top</div>\r
        <div className="mt-2 text-white/70">\r
          Background components should never block interaction.\r
        </div>\r
      </div>\r
    </div>
}`,...r.parameters?.docs?.source}}};const c=["Default"];export{r as Default,c as __namedExportsOrder,d as default};
