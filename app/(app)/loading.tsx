export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="mb-7 flex items-end justify-between">
        <div className="space-y-3"><div className="skeleton h-4 w-36 rounded-full"/><div className="skeleton h-10 w-80 max-w-[75vw] rounded-xl"/><div className="skeleton h-3 w-64 max-w-[65vw] rounded-full"/></div>
        <div className="skeleton hidden h-10 w-36 rounded-xl sm:block"/>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.55fr_.85fr]"><div className="skeleton h-64 rounded-2xl"/><div className="skeleton h-64 rounded-2xl"/></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:4}).map((_,i)=><div key={i} className="skeleton h-36 rounded-xl"/>)}</div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_.8fr]"><div className="skeleton h-80 rounded-2xl"/><div className="skeleton h-80 rounded-2xl"/></div>
    </div>
  );
}
