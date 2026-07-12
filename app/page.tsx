import { redirect } from "next/navigation";

// The landing page is the Properties screen.
export default function IndexPage() {
  redirect("/properties");
}
