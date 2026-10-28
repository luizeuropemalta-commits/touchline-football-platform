import assert from "node:assert/strict";
import test from "node:test";
import { browserDiskReserve, requireBrowserCapacity, type BrowserCapacityIO } from "./helpers/touchline-browser-capacity.mts";
const GiB=1024n**3n;
test("operator reserve accepts 250 MiB locally but never lowers Linux or CI defaults", () => {
  const opt = { TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB: "250" };
  assert.equal(browserDiskReserve("darwin", false, opt), 250n * 1024n**2n);
  assert.equal(browserDiskReserve("darwin", true, { ...opt, CI: "true" }), 5n * GiB);
  assert.equal(browserDiskReserve("linux", true, opt), 5n * GiB);
  assert.equal(browserDiskReserve("darwin", false, {}), 5n * GiB);
  assert.equal(browserDiskReserve("darwin", true, {}), 500n * 1024n**2n);
  for (const value of ["0", "249", "5121", "-1", "250.5", "", "250junk"]) {
    assert.throws(() => browserDiskReserve("darwin", true, { TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB: value }), /reserve/);
  }
});
test("explicit low-disk reserve is Darwin-only, strict and preserves memory checks",()=>{
  const h=fixture("darwin");
  h.io.freeDiskBytes=()=>500n*1024n**2n;
  assert.throws(()=>requireBrowserCapacity("/repo",{allowLowDarwinDisk:true},h.io),/500 MiB/);
  h.io.freeDiskBytes=()=>500n*1024n**2n+1n;
  requireBrowserCapacity("/repo",{allowLowDarwinDisk:true},h.io);
  assert.throws(()=>h.check(),/5 GiB/);
  h.io.run=()=>"4";
  assert.throws(()=>requireBrowserCapacity("/repo",{allowLowDarwinDisk:true},h.io),/memory pressure/);
  const linux=fixture();linux.io.freeDiskBytes=()=>GiB;
  assert.throws(()=>requireBrowserCapacity("/repo",{allowLowDarwinDisk:true},linux.io),/5 GiB/);
});
function fixture(platform="linux") {
  const files: Record<string,string> = {
    "/proc/meminfo":"MemTotal:       8388608 kB\nMemAvailable:   4194304 kB\n",
    "/proc/self/cgroup":"0::/runner/job\n",
    "/proc/self/mountinfo":"29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
    "/sys/fs/cgroup/runner/job/memory.max":String(2n*GiB),
    "/sys/fs/cgroup/runner/job/memory.current":String(GiB),
    "/sys/fs/cgroup/runner/memory.max":"max",
    "/sys/fs/cgroup/runner/memory.current":String(GiB),
    "/sys/fs/cgroup/cgroup.controllers":"cpuset cpu io memory pids\n",
  };
  const calls: string[]=[];
  const io: BrowserCapacityIO = {
    platform,freeDiskBytes:()=>6n*GiB,read:path=>files[path]??null,
    run(command,args) { calls.push(`${command} ${args.join(" ")}`);
      if(command==="sysctl") return "1\n";
      if(command==="memory_pressure") return "System-wide memory free percentage: 25%\n";
      throw Error("Unexpected process"); },
  };
  return { files,calls,io,check:(darwinFreePercent=false)=>requireBrowserCapacity("/repo",{darwinFreePercent},io) };
}

test("Darwin preserves strip's 25% requirement and swap's pressure-only policy",()=>{
  for(const full of [false,true]) {
    const h=fixture("darwin"); h.check(full);
    assert.deepEqual(h.calls,full?["sysctl -n kern.memorystatus_vm_pressure_level","memory_pressure "]:["sysctl -n kern.memorystatus_vm_pressure_level"]);
    h.io.run=()=>"2"; assert.throws(()=>h.check(full),/normal macOS memory pressure/);
  }
  for(const value of ["24%","101%","unavailable"]) {
    const h=fixture("darwin");h.io.run=cmd=>cmd==="sysctl"?"1":`System-wide memory free percentage: ${value}`;
    assert.throws(()=>h.check(true),/25%/);
  }
});
test("disk gate is strict on all platforms and unavailable controls never skip tests",()=>{
  for(const platform of ["linux","darwin"]) {
    const h=fixture(platform);h.io.freeDiskBytes=()=>5n*GiB;
    assert.throws(()=>h.check(),/more than 5 GiB/);
    h.io.freeDiskBytes=()=>5n*GiB+1n;h.check();
    h.io.freeDiskBytes=()=>{throw Error("disk unavailable");};assert.throws(()=>h.check(),/disk unavailable/);
  }
  const h=fixture("win32");assert.throws(()=>h.check(),/unsupported/);
});
test("explicit local moderate-pressure exception never admits critical or unknown pressure",()=>{
  const h=fixture("darwin");
  for(const pressure of ["1","2"]) {
    h.io.run=command=>command==="sysctl"?pressure:"System-wide memory free percentage: 25%";
    requireBrowserCapacity("/repo",{darwinFreePercent:true,allowModerateDarwinPressure:true},h.io);
  }
  for(const pressure of ["0","3","4","unknown",""]) {
    h.io.run=()=>pressure;
    assert.throws(()=>requireBrowserCapacity("/repo",{allowModerateDarwinPressure:true},h.io),/memory pressure/);
  }
  h.io.run=command=>command==="sysctl"?"2":"System-wide memory free percentage: 24%";
  assert.throws(()=>requireBrowserCapacity("/repo",{darwinFreePercent:true,allowModerateDarwinPressure:true},h.io),/25%/);
  h.io.freeDiskBytes=()=>5n*GiB;
  assert.throws(()=>requireBrowserCapacity("/repo",{allowModerateDarwinPressure:true},h.io),/more than 5 GiB/);
  const linux=fixture();linux.files["/sys/fs/cgroup/runner/job/memory.current"]=String(2n*GiB);
  assert.throws(()=>requireBrowserCapacity("/repo",{allowModerateDarwinPressure:true},linux.io),/25%/);
});
test("Linux checks host and cgroup independently, with no macOS subprocesses",()=>{
  const h=fixture();h.check();assert.deepEqual(h.calls,[]);
  h.files["/sys/fs/cgroup/runner/job/memory.current"]=String(3n*GiB/2n);h.check(); // exactly 25% free
  h.files["/sys/fs/cgroup/runner/job/memory.current"]=String(3n*GiB/2n+1n);
  assert.throws(()=>h.check(),/25%/);
  h.files["/sys/fs/cgroup/runner/job/memory.max"]="max";
  h.files["/proc/meminfo"]="MemTotal: 8388608 kB\nMemAvailable: 2097151 kB\n";
  assert.throws(()=>h.check(),/25%/);
});
test("Linux ancestor caps remain effective even when leaf is unlimited",()=>{
  const h=fixture();h.files["/sys/fs/cgroup/runner/job/memory.max"]="max";
  h.files["/sys/fs/cgroup/runner/memory.max"]=String(4n*GiB);
  h.files["/sys/fs/cgroup/runner/memory.current"]=String(4n*GiB-1n);
  assert.throws(()=>h.check(),/25%/);
});
test("missing, malformed, duplicate, or inaccessible Linux capacity controls fail closed",()=>{
  for(const path of ["/proc/meminfo","/proc/self/cgroup","/proc/self/mountinfo","/sys/fs/cgroup/runner/job/memory.max","/sys/fs/cgroup/runner/job/memory.current","/sys/fs/cgroup/cgroup.controllers"]) {
    const h=fixture();delete h.files[path];assert.throws(()=>h.check(),/missing|unavailable/);
  }
  for(const [path,value]of [
    ["/proc/meminfo","MemTotal: 8 GB\nMemAvailable: 4 GB\n"],
    ["/proc/meminfo","MemTotal: 8388608 kB\nMemAvailable: 4194304 kB\nMemAvailable: 4194304 kB\n"],
    ["/proc/meminfo","MemTotal: 1 kB\nMemAvailable: 2 kB\n"],
    ["/proc/self/cgroup","0::/runner/../escape"],
    ["/proc/self/cgroup","0::/one\n0::/two"],
    ["/proc/self/cgroup","0:cpu:/job"],
    ["/proc/self/cgroup","7::/job"],
    ["/proc/self/cgroup","7:cpu,,memory:/job"],
    ["/proc/self/cgroup","7:cpu,cpu:/job"],
    ["/proc/self/cgroup","7:name=:/job"],
    ["/proc/self/mountinfo","invalid"],
    ["/sys/fs/cgroup/runner/job/memory.max","-1"],
    ["/sys/fs/cgroup/runner/job/memory.max","0"],
    ["/sys/fs/cgroup/runner/job/memory.current","NaN"],
    ["/sys/fs/cgroup/runner/job/memory.current",String(3n*GiB)],
  ]) {const h=fixture();h.files[path]=value;assert.throws(()=>h.check());}
  const h=fixture();h.io.read=()=>{throw Error("EACCES");};assert.throws(()=>h.check(),/EACCES/);
});
test("Linux cgroup v1 memory controller and numeric unlimited sentinel are explicit",()=>{
  const h=fixture();h.files["/proc/self/cgroup"]="2:cpu,cpuacct:/job\n3:memory:/runner/job\n";
  h.files["/proc/self/mountinfo"]="29 23 0:26 /runner /sys/fs/cgroup/memory rw - cgroup cgroup rw,memory\n";
  h.files["/sys/fs/cgroup/memory/job/memory.limit_in_bytes"]=String(2n*GiB);
  h.files["/sys/fs/cgroup/memory/job/memory.usage_in_bytes"]=String(GiB);
  h.files["/sys/fs/cgroup/memory/memory.limit_in_bytes"]="9223372036854771712";
  h.files["/sys/fs/cgroup/memory/memory.usage_in_bytes"]=String(GiB);
  h.check();assert.deepEqual(h.calls,[]);
  h.files["/sys/fs/cgroup/memory/job/memory.usage_in_bytes"]=String(2n*GiB);assert.throws(()=>h.check(),/25%/);
});
test("Linux namespace root cap and absence of a v1 memory controller are distinguished",()=>{
  const h=fixture();h.files["/proc/self/cgroup"]="0::/\n";
  h.files["/sys/fs/cgroup/memory.max"]=String(2n*GiB);h.files["/sys/fs/cgroup/memory.current"]=String(2n*GiB-1n);
  assert.throws(()=>h.check(),/25%/);
  h.files["/proc/self/cgroup"]="2:cpu,cpuacct:/job\n7:name=systemd:/job\n";h.check();
});

test("a leaf bind mount cannot hide a constrained parent visible through a broader mount",()=>{
  for(const bindFirst of [true,false]) {
    const h=fixture();
    const broad=h.files["/proc/self/mountinfo"].trim();
    const bind="30 23 0:26 /runner/job /leaf-bind rw - cgroup2 cgroup rw";
    h.files["/proc/self/mountinfo"]=(bindFirst?[bind,broad]:[broad,bind]).join("\n");
    h.files["/leaf-bind/memory.max"]="max";h.files["/leaf-bind/memory.current"]=String(GiB);
    h.files["/sys/fs/cgroup/runner/job/memory.max"]="max";
    h.files["/sys/fs/cgroup/runner/memory.max"]=String(4n*GiB);
    h.files["/sys/fs/cgroup/runner/memory.current"]=String(4n*GiB-1n);
    assert.throws(()=>h.check(),/25%/);
  }
});
