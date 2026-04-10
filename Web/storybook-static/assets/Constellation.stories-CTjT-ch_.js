import{j as e}from"./iframe-B6P-JI9O.js";import n from"./Constellation-5vju403B.js";import"./preload-helper-PPVm8Dsz.js";import"./useReducedMotion-B8214p5W.js";const l={title:"Design System/Backgrounds/Constellation",component:n,argTypes:{color:{control:{type:"color"}},opacity:{control:{type:"number",min:0,max:1,step:.05}},starCount:{control:{type:"number",min:10,max:120,step:5}},connectionDistance:{control:{type:"number",min:50,max:250,step:10}},className:{control:!1}}},t={args:{opacity:.35,starCount:55,connectionDistance:150},render:o=>e.jsxs("div",{className:"relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black",children:[e.jsx(n,{...o}),e.jsxs("div",{className:"relative z-10 p-6",children:[e.jsx("div",{className:"text-lg font-semibold",children:"Constellation"}),e.jsx("div",{className:"mt-2 text-white/70",children:"A star field with subtle connections."})]})]})};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    opacity: 0.35,
    starCount: 55,
    connectionDistance: 150
  },
  render: args => <div className="relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black">\r
      <Constellation {...args} />\r
      <div className="relative z-10 p-6">\r
        <div className="text-lg font-semibold">Constellation</div>\r
        <div className="mt-2 text-white/70">A star field with subtle connections.</div>\r
      </div>\r
    </div>
}`,...t.parameters?.docs?.source}}};const c=["Default"];export{t as Default,c as __namedExportsOrder,l as default};
