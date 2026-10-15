import { notFound } from "next/navigation";
import { DetailView } from "@/components/detail-view";

export const metadata = { title: "豆瓣作品档案" };
export default async function DoubanDetailPage({ params }: { params: Promise<{ mediaType: string; id: string }> }) {
  const { mediaType, id } = await params;
  if ((mediaType !== "movie" && mediaType !== "tv") || !/^[1-9]\d{0,11}$/.test(id)) notFound();
  return <DetailView mediaType={mediaType} id={id} provider="douban"/>;
}
