import { notFound } from "next/navigation";
import { collectionId } from "@/lib/collections";
import { CollectionDetail } from "@/components/collection-library";

export default async function ListPage({ params }: { params: Promise<{ source: string; slug: string }> }) {
  const { source, slug } = await params;
  let id: string;
  try { id = collectionId(source, slug); } catch { notFound(); }
  return <CollectionDetail id={id}/>;
}
