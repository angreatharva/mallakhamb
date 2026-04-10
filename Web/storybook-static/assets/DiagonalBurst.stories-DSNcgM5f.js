import{j as t}from"./iframe-B6P-JI9O.js";import o from"./DiagonalBurst-ja0_ViXV.js";import"./preload-helper-PPVm8Dsz.js";import"./useReducedMotion-B8214p5W.js";const d={title:"Design System/Backgrounds/DiagonalBurst",component:o,argTypes:{color:{control:{type:"color"}},opacity:{control:{type:"number",min:0,max:1,step:.01}},direction:{control:{type:"select"},options:["top-left-to-bottom-right","top-right-to-bottom-left","bottom-left-to-top-right","bottom-right-to-top-left"]},className:{control:!1}}},e={args:{opacity:.1,direction:"top-left-to-bottom-right"},render:r=>t.jsxs("div",{className:"relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black",children:[t.jsx(o,{...r}),t.jsxs("div",{className:"relative z-10 p-6",children:[t.jsx("div",{className:"text-lg font-semibold",children:"Diagonal burst"}),t.jsx("div",{className:"mt-2 text-white/70",children:"A directional gradient accent."})]})]})};e.parameters={...e.parameters,docs:{...e.parameters?.docs,source:{originalSource:`{
  args: {
    opacity: 0.1,
    direction: 'top-left-to-bottom-right'
  },
  render: args => <div className="relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black">\r
      <DiagonalBurst {...args} />\r
      <div className="relative z-10 p-6">\r
        <div className="text-lg font-semibold">Diagonal burst</div>\r
        <div className="mt-2 text-white/70">A directional gradient accent.</div>\r
      </div>\r
    </div>
}`,...e.parameters?.docs?.source}}};const c=["Default"];export{e as Default,c as __namedExportsOrder,d as default};
