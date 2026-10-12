import { notFound } from "next/navigation";
import { DetailView } from "@/components/detail-view";
export const metadata = {title:"剧集档案"};
export default async function Television({params}:{params:Promise<{id:string}>}) { const {id}=await params; if(!/^\d+$/.test(id)||Number(id)<1||!Number.isSafeInteger(Number(id)))notFound();return <DetailView mediaType="tv" id={Number(id)}/>; }
