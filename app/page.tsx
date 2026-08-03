import { redirect } from "next/navigation";

export default function Home() {
  redirect("/arena?lang=pt-BR");
}
