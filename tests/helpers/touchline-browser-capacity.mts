import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statfsSync } from "node:fs";
import { posix } from "node:path";

export type BrowserCapacityIO = {
  platform: string;
  freeDiskBytes(root: string): bigint;
  read(path: string): string | null; // null means ENOENT only; permission errors throw.
  run(command: string, args: readonly string[]): string;
};
const local: BrowserCapacityIO = {
  platform: process.platform,
  freeDiskBytes(root) { const disk=statfsSync(root,{bigint:true}); return disk.bavail*disk.bsize; },
  read(path) {
    try { return readFileSync(path,"utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  },
  run: (command,args) => execFileSync(command,[...args],{encoding:"utf8",timeout:3000,maxBuffer:1024*1024}),
};
const integer = (text: string): bigint => {
  assert.match(text,/^(0|[1-9][0-9]*)$/,"invalid capacity counter"); return BigInt(text);
};
function absolute(path: string) {
  assert.ok(path.startsWith("/") && !/[\0\n\r]/.test(path) && !path.split("/").includes(".."),"invalid cgroup path");
  return posix.normalize(path);
}
function mountPath(text: string) {
  return absolute(text.replace(/\\(040|011|012|134)/g,(_,octal: string) => String.fromCharCode(parseInt(octal,8))));
}
function memoryRatio(available: bigint,total: bigint) {
  assert.ok(total>0n && available>=0n && available<=total,"invalid memory capacity");
  assert.ok(available*4n>=total,"at least 25% available memory required");
}

/** No processes are started except bounded macOS diagnostics. Linux availability
 * is not macOS pressure: check host MemAvailable and every visible cgroup cap.
 * A namespace cannot expose limits above its mount root; never claim otherwise.
 */
export function requireBrowserCapacity(root: string, options: { darwinFreePercent?: boolean; allowModerateDarwinPressure?: boolean; allowLowDarwinDisk?: boolean } = {}, io: BrowserCapacityIO = local): void {
  const lowDisk = io.platform === "darwin" && options.allowLowDarwinDisk === true;
  assert.ok(io.freeDiskBytes(root)>(lowDisk ? 500n*1024n**2n : 5n*1024n**3n),
    lowDisk ? "browser requires more than 500 MiB emergency reserve" : "browser requires more than 5 GiB free disk");
  if (io.platform === "darwin") {
    // Explicit operator override for this local test process only, never CI.
    // Keep the disk reserve and real behavioral assertions in place.
    if (io === local && process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE === "1" && !process.env.CI) {
      console.warn("Local browser memory preflight bypassed by explicit operator request; disk reserve remains enforced.");
      return;
    }
    const pressure=io.run("sysctl",["-n","kern.memorystatus_vm_pressure_level"]).trim();
    assert.ok(pressure==="1" || (options.allowModerateDarwinPressure===true && pressure==="2"),
      "normal macOS memory pressure required unless moderate pressure explicitly authorized locally");
    if (options.darwinFreePercent) {
      const percentage=Number(io.run("memory_pressure",[]).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
      assert.ok(Number.isFinite(percentage) && percentage>=25 && percentage<=100,"at least 25% free memory required");
    }
    return;
  }
  assert.equal(io.platform,"linux","unsupported browser capacity platform");
  const required=(path: string) => { const value=io.read(path); assert.notEqual(value,null,`capacity control missing: ${path}`); return value!; };
  const meminfo=required("/proc/meminfo");
  const metric=(key: string) => {
    const rows=meminfo.split("\n").filter(line=>line.startsWith(`${key}:`));
    assert.equal(rows.length,1,"missing or duplicate Linux memory metric");
    const match=rows[0].match(new RegExp(`^${key}:\\s+([0-9]+) kB\\s*$`));
    assert.ok(match,"invalid Linux memory metric"); return integer(match[1])*1024n;
  };
  memoryRatio(metric("MemAvailable"),metric("MemTotal"));
  const memberships=required("/proc/self/cgroup").trim().split("\n").map(line=>{
    const match=line.match(/^(0|[1-9]\d*):([^:]*):(\/.*)$/); assert.ok(match,"invalid cgroup membership");
    const controllers=match[2].split(",");
    if (match[1]==="0") assert.equal(match[2],"","unified cgroup cannot list controllers");
    else assert.ok(controllers.every(controller=>/^(?:[a-z][a-z0-9_]*|name=[A-Za-z0-9_.-]+)$/.test(controller))
      && new Set(controllers).size===controllers.length,"invalid v1 controller inventory");
    return { version:match[1]==="0" ? 2 : 1, controllers,path:absolute(match[3]) };
  });
  const memory=memberships.filter(row=>row.version===1 && row.controllers.includes("memory"));
  const unified=memberships.filter(row=>row.version===2);
  assert.ok(memory.length<=1 && unified.length<=1,"ambiguous cgroup membership");
  // Hybrid setups can assign memory to v1; that controller takes precedence.
  const membership=memory[0] ?? unified[0];
  if (!membership) return; // Explicit v1 inventory has no memory controller.
  const mounts=required("/proc/self/mountinfo").trim().split("\n").flatMap(line=>{
    const pair=line.split(" - "); assert.equal(pair.length,2,"invalid cgroup mount inventory");
    const pre=pair[0].split(" "),post=pair[1].split(" ");
    if (post[0] !== (membership.version===2 ? "cgroup2" : "cgroup")) return [];
    if (membership.version===1 && !post[2]?.split(",").includes("memory")) return [];
    assert.ok(pre.length>=6 && post.length>=3,"invalid cgroup mount");
    return [{root:mountPath(pre[3]),point:mountPath(pre[4])}];
  }).filter(mount=>membership.path===mount.root || membership.path.startsWith(`${mount.root==="/"?"":mount.root}/`) || membership.path==="/")
    // Prefer the broadest visible hierarchy, not a leaf bind mount that would
    // hide a constrained parent. Independent of mountinfo enumeration order.
    .sort((a,b)=>a.root.length-b.root.length);
  assert.ok(mounts.length>0,"memory cgroup mount unavailable");
  const mount=mounts[0];
  let directory=membership.path==="/" ? mount.point : posix.join(mount.point,posix.relative(mount.root,membership.path));
  assert.ok(directory===mount.point || directory.startsWith(`${mount.point}/`),"cgroup escaped mount");
  for (;;) {
    const limitName=membership.version===2 ? "memory.max" : "memory.limit_in_bytes";
    const currentName=membership.version===2 ? "memory.current" : "memory.usage_in_bytes";
    const rawLimit=io.read(posix.join(directory,limitName));
    if (rawLimit===null) {
      // A genuine v2 hierarchy root does not expose memory.max. Require its
      // controller inventory; missing controls below the root are never ignored.
      assert.ok(membership.version===2 && directory===mount.point && mount.root==="/","memory cgroup limit missing");
      const controllers=required(posix.join(directory,"cgroup.controllers")).trim();
      assert.ok(controllers==="" || /^[a-z_]+(?: [a-z_]+)*$/.test(controllers),"invalid cgroup controller inventory");
    } else {
      const usage=integer(required(posix.join(directory,currentName)).trim());
      const limit=rawLimit.trim();
      if (!(membership.version===2 && limit==="max")) {
        const maximum=integer(limit);
        // v1's huge unlimited sentinel remains exact under bigint arithmetic.
        // Host availability is checked independently, even for unlimited caps.
        memoryRatio(maximum-usage,maximum);
      }
    }
    if (directory===mount.point) break;
    directory=posix.dirname(directory);
  }
}
