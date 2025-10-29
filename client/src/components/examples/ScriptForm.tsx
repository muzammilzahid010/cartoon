import ScriptForm from "../ScriptForm";

export default function ScriptFormExample() {
  return (
    <ScriptForm 
      onSubmit={(data) => console.log("Form submitted:", data)} 
    />
  );
}
