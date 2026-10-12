import { notFound } from "next/navigation";
import { DetailView } from "@/components/detail-view";
export const metadata = {title:"电影档案"};
export default async function Movie({params}:{params:Promise<{id:string}>}) { const {id}=await params; if(!/^\d+$/.test(id)||Number(id)<1||!Number.isSafeInteger(Number(id)))notFound();return <DetailView mediaType="movie" id={Number(id)}/>; }
