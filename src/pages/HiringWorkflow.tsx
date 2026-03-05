export default function HiringWorkflow() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}school-app/hiring-workflow.html`}
      className="w-full border-0"
      style={{ height: 'calc(100vh - 52px)', minHeight: '600px' }}
      title="Hiring Workflow"
    />
  );
}
