import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import * as localeResolver from '../lib/touchlineArena/catalogue-locale.ts';
import * as i18n from '../lib/touchlineArena/i18n.ts';
import * as rankingCopy from '../lib/touchlineArena/rankings-i18n.ts';
import * as zoomCopy from '../lib/touchlineArena/card-zoom-i18n.ts';
import * as exactCopy from '../lib/touchlineArena/exact-card-i18n.ts';
import * as positions from '../lib/touchlineArena/position-labels.ts';
import * as stats from '../lib/touchlineArena/position-aware-card-stats.ts';
import * as tiers from '../lib/touchlineArena/card-rules.ts';
import * as details from '../lib/touchlineArena/card-zoom-details.ts';
import * as compare from '../lib/touchlineArena/ranked-card-catalog.ts';
import * as navigation from '../lib/touchlineArena/arena-navigation.ts';
import * as links from '../lib/touchlineArena/player-links.ts';
import * as engineLinks from '../lib/touchlineArena/card-engine-links.ts';
import * as surfaces from '../lib/touchlineArena/global-navigation.ts';
import * as presentation from '../lib/touchlineArena/public-card-presentation.ts';
import * as leadership from '../lib/touchlineArena/card-leadership-authority.ts';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import * as access from '../lib/touchlineArena/auth-access.ts';

const empty=()=>null;
type CapturedProps = Record<string, unknown> & {
  children?: React.ReactNode;
  expandedContent?: React.ReactNode;
  player: { name: string; id: string };
  details: { cardEngineHref?: string };
  accountLocaleContext: { mode: string; accountId?: string };
};
type PageRender = (props: { searchParams: Promise<{ lang: string }> }, draft?: boolean) => Promise<React.ReactNode>;
function harness(authFailure?:Error, publicationFailure?:Error, envelope: unknown = {data:{user:null},error:null}) {
  let authReads=0;
  const captures:Array<{kind:string;props:CapturedProps}>=[];
  const card={id:'literal-id',canonicalPlayerId:'22222222-2222-4222-8222-222222222222',name:'Player $& <official>',clubName:'Official FC',position:'Defender',role:'DEF',countryCode3:'FRA',shirtNumber:4,seasonTotalRating:12.75,matchRating:7.5,matchStats:{},seasonStats:{},editorialCard:null,cardReview:null};
  const leaf=(kind:string)=>function CapturedLeaf(props:CapturedProps){captures.push({kind,props}); return kind==='zoom'?React.createElement(React.Fragment,null,props.children,props.expandedContent):null;};
  const modules:Record<string,unknown>={
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    'react/jsx-runtime':jsx,
    '@supabase/supabase-js':{AuthSessionMissingError},
    '@/lib/touchlineArena/auth-access':access,
    '@/components/touchline/TouchlineBrandHeader':{default:leaf('header')},
    '@/lib/touchlineArena/catalogue-locale':localeResolver,'@/lib/touchlineArena/i18n':i18n,
    '@/lib/touchlineArena/rankings-i18n':rankingCopy,'@/lib/touchlineArena/card-zoom-i18n':zoomCopy,'@/lib/touchlineArena/exact-card-i18n':exactCopy,
    '@/lib/touchlineArena/position-labels':positions,'@/lib/touchlineArena/position-aware-card-stats':stats,
    '@/lib/touchlineArena/card-rules':tiers,'@/lib/touchlineArena/card-zoom-details':details,
    '@/lib/touchlineArena/ranked-card-catalog':compare,'@/lib/touchlineArena/arena-navigation':navigation,
    '@/lib/touchlineArena/player-links':links,'@/lib/touchlineArena/card-engine-links':engineLinks,
    '@/lib/touchlineArena/global-navigation':surfaces,'@/lib/touchlineArena/public-card-presentation':presentation,
    '@/lib/touchlineArena/card-leadership-authority':leadership,
    '@/components/touchline/TouchlineClubPerimeterTrace':{default:empty},
    '@/components/touchline/cards/TouchlineEliteExactCard':{default:leaf('card')},
    '@/components/touchline/cards/TouchlineCardZoom':{default:leaf('zoom')},
    '@/components/touchline/TouchlineGlobalNavigation':{default:leaf('nav')},
    '@/components/touchline/TouchlineLivePresentationRefresh':{default:empty},
    '@/components/touchline/cards/TouchlineCardLeadershipProvider':{TouchlineCardLeadershipProvider:({children}:React.PropsWithChildren)=>children},
    '@/lib/touchlineArena/demo-data':{TOUCHLINE_CARD_STUDIO_LAYOUT_KEY:'stable-layout',findTouchLineClub:()=>null,squadCardToExactPlayer:(value:unknown)=>value},
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>{authReads++;if(authFailure)throw authFailure;return envelope;}}})},
    '@/lib/touchlineArena/card-ranking-server':{loadTouchLineActiveRanking:async()=>{if(publicationFailure)throw publicationFailure;return {phase:'ranked',snapshotId:'snapshot-id',seasonId:'season-id'};}},
    '@/lib/touchlineArena/ranked-card-catalog-server':{loadTouchLineRankedCardCatalog:async()=>[{...card}]},
    '@/lib/admin/owner':{isOwnerEmail:(email:string)=>email==='owner@example.test'},
  };
  const exports={} as { default: PageRender; isolatedRender: PageRender };
  const source=readFileSync(new URL('../app/touchline-player-card-rankings/page.tsx',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source+'\nexport {renderPlayerCardRankings as isolatedRender};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require(name:string){assert.ok(name in modules,name);return modules[name];}});
  return {exports,captures,authReads:()=>authReads,card};
}

test('real ranking route keeps defaults and propagates all eight opted-in presentations to existing cards/zooms',async()=>{
  const h=harness();
  for(const locale of ['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE']) for(const [draft,publicRelease] of [[false,false],[true,false],[true,true]]) {
    siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED = publicRelease ? 'true' : undefined;
    h.captures.length=0; const before=h.authReads();
    const props={searchParams:Promise.resolve({lang:locale})};
    const tree=draft&&!publicRelease?await h.exports.isolatedRender(props,true):await h.exports.default(props);
    delete siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED;
    const html=renderToStaticMarkup(tree);
    const effective=localeResolver.resolveTouchlineCatalogueLocale(locale,draft);
    assert.equal(html.split(`href="/clubowner?lang=${effective}"`).length - 1, 2, 'both market links retain the effective public or private locale');
    assert.equal(h.authReads(),before+1);
    assert.ok(html.includes('dir="ltr"'));
    assert.ok(html.includes('Player $&amp; &lt;official&gt;'));
    assert.ok(html.includes('12.75'));
    assert.ok(html.includes(rankingCopy.getTouchLineRankingsCopy(locale,draft).rankingTitle));
    const cards=h.captures.filter(x=>x.kind==='card');
    const zooms=h.captures.filter(x=>x.kind==='zoom');
    assert.equal(cards.length,4); assert.equal(zooms.length,2);
    for(const {props:child} of cards) {
      assert.equal(child.runtimeLocaleOverride,effective);assert.equal(child.draftLocalesEnabled,draft);
      assert.equal(child.player.name,h.card.name);assert.equal(child.player.id,h.card.id);
      assert.equal(child.hideMarketValuePanel,true);
    }
    for(const {props:child} of zooms) {
      assert.equal(child.locale,effective);assert.equal(child.draftLocalesEnabled,draft);
      assert.equal(child.ariaLabel,zoomCopy.getTouchlineCardZoomCopy(locale,draft).openCard.replace('{playerName}',()=>h.card.name));
      assert.equal(child.contractHref,undefined);assert.equal(child.contractValue,undefined);
      assert.ok(child.details);
    }
    const nav=h.captures.find(x=>x.kind==='nav')!.props;
    assert.equal(nav.locale,effective);assert.equal(nav.draftLocalesEnabled,draft);
    assert.equal(nav.showAudioControl,false);
    const headers=h.captures.filter(x=>x.kind==='header');assert.equal(headers.length,1);
    assert.equal(headers[0].props.locale,effective);assert.equal(headers[0].props.draftLocalesEnabled,draft);
    assert.equal(headers[0].props.accountLocaleContext.mode,'guest');
    assert.equal(headers[0].props.href,`/touchline-player-card-rankings?lang=${encodeURIComponent(effective)}`);
  }
});

test('single verified identity drives header account controls and owner links; error envelopes fail closed',async()=>{
  const owner={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',app_metadata:{touchline_arena_access_v1:true}};
  const customer={id:'33333333-3333-4333-8333-333333333333',email:'customer@example.test',app_metadata:{touchline_arena_access_v1:true}};
  const cases=[
    {envelope:{data:{user:null},error:null},mode:'guest',owner:false},
    {envelope:{data:{user:null},error:new AuthSessionMissingError()},mode:'guest',owner:false},
    {envelope:{data:{user:null},error:Error('unavailable')},mode:'unavailable',owner:false},
    {envelope:{data:{user:owner},error:Error('unverified')},mode:'unavailable',owner:false},
    {envelope:{data:{user:owner},error:new AuthSessionMissingError()},mode:'unavailable',owner:false},
    {envelope:{data:{user:owner}},mode:'unavailable',owner:false},
    {envelope:{data:{user:{...owner,id:'invalid'}},error:null},mode:'unavailable',owner:false},
    {envelope:{data:{user:{...owner,app_metadata:{}}},error:null},mode:'unavailable',owner:false},
    {envelope:{data:{user:customer},error:null},mode:'account',owner:false},
    {envelope:{data:{user:owner},error:null},mode:'account',owner:true},
  ];
  for(const item of cases){
    const h=harness(undefined,undefined,item.envelope);
    renderToStaticMarkup(await h.exports.default({searchParams:Promise.resolve({lang:'pt-BR'})}));
    assert.equal(h.authReads(),1);
    const header=h.captures.filter(x=>x.kind==='header');assert.equal(header.length,1);
    assert.equal(header[0].props.accountLocaleContext.mode,item.mode);
    if(item.mode==='account')assert.equal(header[0].props.accountLocaleContext.accountId,item.envelope.data.user!.id);
    else assert.equal(header[0].props.accountLocaleContext.accountId,undefined);
    for(const {props} of h.captures.filter(x=>x.kind==='zoom')){
      assert.equal(Boolean(props.details.cardEngineHref),item.owner);
      if(item.owner)assert.equal(props.details.cardEngineHref,engineLinks.touchlineCardEnginePlayerHref(h.card.canonicalPlayerId,'pt-BR'));
    }
    const nav=h.captures.find(x=>x.kind==='nav')!.props;
    assert.equal(nav.showAudioControl,false);
    assert.equal(nav.surface,surfaces.resolveTouchlineGlobalNavigationSurface({isAuthenticated:item.mode==='account',isAdmin:item.owner}));
    if(item.mode==='account'&&!item.owner)assert.equal(nav.surface,'authenticated');
  }
});

test('malformed null auth data fails before exposing header identity or owner links',async()=>{
  const h=harness(undefined,undefined,{data:null,error:null});
  await assert.rejects(h.exports.default({searchParams:Promise.resolve({lang:'pt-BR'})}),{name:'TypeError'});
  assert.equal(h.authReads(),1);
  assert.equal(h.captures.length,0);
});

test('auth/publication failure precedence stays auth first, with no rendered owner links',async()=>{
  const auth=Error('auth boundary');const publication=Error('publication boundary');
  const both=harness(auth,publication);
  await assert.rejects(both.exports.default({searchParams:Promise.resolve({lang:'ar-SA'})}),error=>error===auth);
  assert.equal(both.authReads(),1);assert.equal(both.captures.length,0);
  const publicOnly=harness(undefined,publication);
  await assert.rejects(publicOnly.exports.isolatedRender({searchParams:Promise.resolve({lang:'ar-SA'})},true),error=>error===publication);
  assert.equal(publicOnly.captures.length,0);
});
