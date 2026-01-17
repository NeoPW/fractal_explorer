struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

struct Zoom {
    center: vec2f,
    scale: f32,
    aspect: f32,
};

@group(0) @binding(0) var<uniform> zoom: Zoom;

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
    var positions = array<vec2f, 3> (
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1, 3.0),
    );
    
    let pos = positions[index];

    var output: VertexOutput;
    output.position = vec4f(pos, 0.0, 1.0);
    output.uv = pos * 0.5 + vec2f(0.5);
    return output;
}

fn paletteColor(t: f32) -> vec3f {
    let palette = array<vec3f, 4>(
    vec3f(0.05, 0.15, 0.18), // deep teal (background)
    vec3f(0.10, 0.60, 0.55), // teal-green
    vec3f(0.30, 0.80, 0.40), // green highlight
    vec3f(0.55, 0.25, 0.75)  // violet accent
    );
    let n = 3.0;
    let x = fract(t) * n;

    let i = u32(floor(x));
    let f = fract(x);

    return mix(palette[i], palette[i + 1], f);
}


@fragment
fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
    let outerColor1: vec3f = vec3f(0.3, 0.0, 0.9);
    var outerColor2: vec3f = vec3f(0.8, 0.0, 0.5);
    
    let x0: f32 = (uv.x - 0.5) * zoom.scale * zoom.aspect + zoom.center.x;
    let y0: f32 = (uv.y - 0.5) * zoom.scale + zoom.center.y;

    let maxIterations: u32 = 10000;
    var z = vec2f(0.0);
    var i: u32 = 0u;

    loop {
    if (i >= maxIterations) { break; }

    let x = z.x;
    let y = z.y;

    if (x * x + y * y >= 4.0) { break; }

    z = vec2f(
        x * x - y * y + x0,
        2.0 * x * y + y0
    );

    i++;
    }

    if(i == maxIterations) {
    return vec4f(0, 0, 0, 1);
    }

    let r2 = z.x * z.x  + z.y * z.y;
    let logZn = log(r2) / 2.0;
    let nu = log(logZn / log(2.0)) / log(2.0);
    let smoothIter = f32(i) + 1.0 - nu;

    //magma
    // let t = f32(smoothIter) / f32(maxIterations);
    // // let color = mix(outerColor1, outerColor2, t);
    // let color = vec3f(t*t, t*0.3, pow(t, 4.0));

    // //classic
    let t = smoothIter * 0.035;
    let color = paletteColor(t);
    return vec4f(color, 1);
}