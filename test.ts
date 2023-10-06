import { udd, UddOptions, UddResult } from "./mod.ts";
import { RegistryCtor } from "./registry.ts";
import { assertEquals, FakeDenoLand, FakeRegistry } from "./test_deps.ts";

async function testUdd(
  before: string,
  after: string,
  registries: RegistryCtor[] = [FakeRegistry],
) {
  const fn = await Deno.makeTempFile();
  try {
    const encoder = new TextEncoder();
    await Deno.writeFile(fn, encoder.encode(before));
    const results: UddResult[] = await udd(
      fn,
      { _registries: registries, quiet: true } as UddOptions,
    );

    const decoder = new TextDecoder();
    const altered = decoder.decode(await Deno.readFile(fn));
    assertEquals(after, altered);
    return results;
  } finally {
    await Deno.remove(fn);
  }
}

Deno.test("uddFakeregistry", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.2/mod.ts";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeregistryNotFound", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.3/mod.ts#=";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.3/mod.ts#=";';
  const results = await testUdd(contents, expected);
  assertEquals(1, results.length);
  assertEquals(false, results[0].success);
  assertEquals("no compatible version found", results[0].message);
});

Deno.test("uddFakeDenolandStd", async () => {
  const contents = 'import "https://deno.land/std@0.34.0/mod.ts";';
  const expected = 'import "https://deno.land/std@0.35.0/mod.ts";';
  await testUdd(contents, expected, [FakeDenoLand]);
});

Deno.test("uddFakeregistryEqToken", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#=0.0.1";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#=0.0.1";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeregistryTildeToken", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#~0.0.1";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.2/mod.ts#~0.0.1";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeregistryLtToken", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#<0.1.0";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.2/mod.ts#<0.1.0";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeregistryLtTokenSpaces", async () => {
  const contents =
    'import "https://fakeregistry.com/foo@0.0.1/mod.ts# < 0.1.0";';
  const expected =
    'import "https://fakeregistry.com/foo@0.0.2/mod.ts# < 0.1.0";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeregistryInvalidFragmentSemver", async () => {
  const contents =
    'import "https://fakeregistry.com/foo@0.0.1/mod.ts# < 0.1.b";';
  const expected =
    'import "https://fakeregistry.com/foo@0.0.1/mod.ts# < 0.1.b";';
  const results = await testUdd(contents, expected);
  assertEquals(results.length, 1);
  assertEquals(results[0].success, false);
  assertEquals(results[0].message, "invalid semver version: 0.1.b");
});

Deno.test("uddFakeregistryInvalidFragmentFoo", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#foo";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#foo";';
  const results = await testUdd(contents, expected);
  assertEquals(results.length, 1);
  assertEquals(results[0].success, false);
  assertEquals(results[0].message, "invalid semver fragment: foo");
});

Deno.test("uddFakeregistryEq", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#=";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#=";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeregistryTilde", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#~";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.2/mod.ts#~";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeregistryCaret", async () => {
  const contents = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#^";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.2/mod.ts#^";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeMultiple", async () => {
  const contents = `
import "https://deno.land/std@0.34.0/mod.ts";
import "https://deno.land/std@0.34.0/foo.ts";
import { foo } from "https://fakeregistry.com/foo@0.0.1/mod.ts";
import { bar } from "https://fakeregistry.com/foo@0.0.1/bar.ts#=";
`;
  const expected = `
import "https://deno.land/std@0.35.0/mod.ts";
import "https://deno.land/std@0.35.0/foo.ts";
import { foo } from "https://fakeregistry.com/foo@0.0.2/mod.ts";
import { bar } from "https://fakeregistry.com/foo@0.0.1/bar.ts#=";
`;
  const results = await testUdd(
    contents,
    expected,
    [FakeRegistry, FakeDenoLand],
  );
  assertEquals(4, results.length);
  // the ordering is a little weird...
  // (it corresponds to the order passed registries)
  // FIXME make less fragile by improving search.ts to provide urls in order
  assertEquals([true, undefined, true, true], results.map((x) => x.success));
});

Deno.test("uddFakeregistryFragmentMove", async () => {
  const contents = 'import "https://fakeregistry.com/foo@~0.0.1/mod.ts";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.2/mod.ts#~";';
  await testUdd(contents, expected);
});

Deno.test("uddFakeregistryFragmentMoveEq", async () => {
  const contents = 'import "https://fakeregistry.com/foo@=0.0.1/mod.ts";';
  const expected = 'import "https://fakeregistry.com/foo@0.0.1/mod.ts#=";';
  await testUdd(contents, expected);
});

Deno.test("uddGitHubRawBranchName", async () => {
  const contents = `
import "https://raw.githubusercontent.com/foo/bar/main/mod.ts";
import "https://raw.githubusercontent.com/foo/bar/main/mod.ts#=";
`;
  const expected = `
import "https://raw.githubusercontent.com/foo/bar/main/mod.ts";
import "https://raw.githubusercontent.com/foo/bar/main/mod.ts#=";
`;
  const results = await testUdd(contents, expected);
  assertEquals(results.length, 0);
});

Deno.test("uddIgnoreComments", async () => {
  {
    const contents = `//import "https://fakeregistry.com/foo@0.0.1/mod.ts";`;
    const expected = contents;
    const results = await testUdd(contents, expected);
    assertEquals(results.length, 0);
  }
  {
    const contents = `/*import "https://fakeregistry.com/foo@0.0.1/mod.ts";*/`;
    const expected = contents;
    const results = await testUdd(contents, expected);
    assertEquals(results.length, 0);
  }
  // limitations
  //
  // TODO: probably, we should use a js parser and collect and modify import
  // declarations in the AST.  Then, serialize the modified AST to the source
  // text.
  {
    const contents = `
//import "https://fakeregistry.com/foo@0.0.1/mod.ts";
import "https://fakeregistry.com/foo@0.0.1/mod.ts";
`;
    const expected = `
//import "https://fakeregistry.com/foo@0.0.2/mod.ts";
import "https://fakeregistry.com/foo@0.0.2/mod.ts";
`;
    const results = await testUdd(contents, expected);
    assertEquals(results.length, 1);
  }
});
