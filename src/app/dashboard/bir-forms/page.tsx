import { redirect } from "next/navigation";

// The real BIR Forms page lives at /dashboard/forms (linked from the
// sidebar) — this route exists so /dashboard/bir-forms also resolves
// instead of 404ing, per the "make both work" requirement.
export default function BirFormsAlias() {
  redirect("/dashboard/forms");
}
