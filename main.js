function onLoad(){
    initializeBackground();
}

function initializeBackground(){
    // set canvas size 
    let canvas = document.getElementById('background-canvas');
    let backdrop = document.getElementById('backdrop');

    canvas.width = backdrop.clientWidth-1;
    canvas.height = backdrop.clientHeight;

    let root = makeNode([0,0], [1,0], [49, 124, 59], .3, undefined);
    // for a test, make some random points
    let list1 = [[1.03,.01],[2.01,.08],[3.01,.45]];
    let list2 = [[3.61,1.03],[3.75,1.6],[3.59,2.06]];
    let list3 = [[4.1,.85],[5.21,.96]];

    let s = 20;
    for(let i = 0; i < list1.length; i++){
        list1[i] = scale(s, list1[i]);
    }
    for(let i = 0; i < list2.length; i++){
        list2[i] = scale(s, list2[i]);
    }
    for(let i = 0; i < list3.length; i++){
        list3[i] = scale(s, list3[i]);
    }

    let l1Dirs = [];
    for(let i = 0; i < list1.length - 1; i++){
        l1Dirs.push(minus(list1[i+1], list1[i]));
    }
    l1Dirs.push(minus(list2[list2.length-1], list1[list1.length-1]));
    let l2Dirs = [];
    for(let i = 0; i < list2.length - 1; i++){
        l2Dirs.push(minus(list2[i+1], list2[i]));
    }
    l2Dirs.push(l2Dirs[l2Dirs.length-1]);
    let l3Dirs = [];
    for(let i = 0; i < list3.length - 1; i++){
        l3Dirs.push(minus(list3[i+1], list3[i])); 
    }
    l3Dirs.push(l3Dirs[l3Dirs.length - 1]);

    let color = [49, 124, 59];
    let width = 1;
    let prevNode = root;
    // build the tree
    for(let i = 0; i < list1.length; i++){
        prevNode = makeNode(list1[i], l1Dirs[i], color, width, prevNode);
    }
    let tempPrev = prevNode;
    for(let i = 0; i < list2.length; i++){
        prevNode = makeNode(list2[i], l2Dirs[i], color, width, prevNode);
    }
    prevNode = tempPrev;
    for(let i = 0; i < list3.length; i++){
        prevNode = makeNode(list3[i], l3Dirs[i], color, width, prevNode);
    }
    
    setSplineTimes(root);

    // in seconds
    const animationTime = .5;
    let time = null;
    let startTime = null;
    let activeBranches = [root];
    function step(timestamp){
        if(time !== null){
            let dt = timestamp - time;
            let currentRealTime = time - startTime;
            let relativeTimeStart = currentRealTime /1000 / animationTime;
            let relativeTimeEnd = relativeTimeStart + dt/1000/animationTime;
            let tasks = getIntervalTasks(relativeTimeStart, relativeTimeEnd, activeBranches); 
            activeBranches = tasks.activeBranches;
            drawLines(tasks.lines);
        }else{
            startTime = timestamp;
        }
        time = timestamp;
        if(time - startTime <= animationTime*1000){
            window.requestAnimationFrame(step);
        }
    }
    window.requestAnimationFrame(step);
}

function drawLines(lines){
    let canvas = document.getElementById('background-canvas');
    let ctx = canvas.getContext('2d');

    function transform(p){
        return [p[0] + canvas.clientWidth/2, canvas.clientHeight/2 - p[1]];
    }

    for(let line of lines){
        ctx.beginPath();
        ctx.moveTo(...transform(line.p1));
        ctx.lineTo(...transform(line.p2));
        ctx.strokeStyle = 'rgb('+line.color[0]+','+line.color[1]+','+line.color[2]+')';
        ctx.lineWidth = line.width;
        ctx.stroke();
    }
}

// vine-tree code
// this is for Audrey, so aesthetics over function. We're 
// pulling all the stops on this one

// we want a vine that sprawls out across the website, ideally 
// with flowers. To do this, we make a tree where every node is 
// a point on the vine (with root the base of the vine, obviously)

// we will interpolate <s>cubic splines</s> cubic bezier curves by first derivative to get a smooth 
// animation, and of course colors will be a priority

// pos: relative position given (0,0) is the center of the screen, (1,0)
//  points to the right, (0,1) points up. In pixels or something
// dir: direction of vine at point (i.e. tangent space generator)
// color: color. pretty self explanatory 
// width: width of vine at position. Probably will end up average width or something
// parent: this is a tree we're talking about here...
// time: what time this node will be drawn (in global time, t in [0,1])
function makeNode(pos, dir, color, width, parent){
    let newNode = {
        pos: pos,
        dir: dir,
        color: color,
        width:width,
        children:[],
        parent:parent,
        time:'NOT SET'
    }
    // root doesn't have a parent
    if(parent){
        parent.children.push(newNode);
        newNode.spline = getSpline(parent, newNode);
    }
    return newNode;
}

function getSpline(parent, child){
    // this is going to be a fun time 
    // for now we're going for a cubic bezier curve with control points inline with the derivatives

    // who knows what kinda lazy folks won't normalize their directions?
    parent.dir = normalize(parent.dir);
    child.dir = normalize(child.dir);

    // calculate our base control points' distances from the end points. 
    // I am arbitrarily setting it to 1/3 the distance between the end points. 
    // it will probably be good enough

    let controlDist = mag(minus(child.pos, parent.pos))/3;

    let control1 = plus(parent.pos, scale(controlDist,parent.dir));
    let control2 = plus(child.pos, scale(-controlDist, child.dir));

    // so now we need an estimate of the length of this bezier curve. ha. 
    // we know the line parent --> child is a lower estimate and the 
    // line path parent --> control1 --> control2 --> child is an upper estimate...
    // so why not average them?
    let lengthEst = (controlDist * 3 + mag(minus(parent.pos,control1))+mag(minus(control1,control2))+mag(minus(control2,child.pos)))/2;
    return {
        p1:parent.pos,
        control1: control1,
        control2: control2,
        p2:child.pos,
        lengthEst: lengthEst,
        startTime: 'NOT SET',
        endTime: 'NOT SET'
    };
}
// t is global time (see "getIntervalTasks") because we're savvy
function evalSpline(spline, t){
    // t must be in the spline start/end interval 
    if(t < spline.startTime || t > spline.endTime){
        // die horribly
        console.log('ERROR: spline time evaluation out of range');
        return undefined;
    }
    // normalize t to "local" bezier time 
    let realT = (t - spline.startTime) / (spline.endTime - spline.startTime);
    // and now for the actual bezier stuff 
    // see https://en.wikipedia.org/wiki/B%C3%A9zier_curve under cubic bezier, explicit form
    let sum1 = scale((1-realT)**3, spline.p1);
    let sum2 = scale(3*realT*(1-realT)**2, spline.control1);
    let sum3 = scale(3*realT**2*(1-realT), spline.control2);
    let sum4 = scale(realT**3, spline.p2);
    return plus(sum1, plus(sum2, plus(sum3, sum4)));
}

// i.e. start and end times for splines 
function setSplineTimes(root){
    // start by setting time = distance from root, then normalize 
    let stack = [root];
    let maxTime = 0;
    while(stack.length > 0){
        let node = stack.pop();
        // add the children 
        stack.push(...node.children);
        // if is root 
        if(node === root){
            node.time = 0;
            continue;
        }
        // the children always have the spline info
        node.time = node.parent.time + node.spline.lengthEst;
        if(node.time > maxTime){
            maxTime = node.time;
        }
    }

    // now normalize all the times
    stack = [root];
    while(stack.length > 0){
        let node = stack.pop();
        stack.push(...node.children);
        node.time /= maxTime;
        if(node.parent){
           node.spline.startTime = node.parent.time;
           node.spline.endTime = node.time;
        }
    }
}

// we have an idea of a global drawing time. t=0 means that nothing 
// is drawn yet. t=1 means that everything is drawn. Each t interval 
// has some work assigned to it
function getIntervalTasks(tStart, tFinish, activeBranches){
    // we have several tasks, we'll stick to lines for now
    // we assume activeBranches = [root] to start with
    let lines = [];
    let newActiveBranches = [];
    console.log('active branches', activeBranches.length);
    for(let branch of activeBranches){
        let branchAdded = false;
        console.log('inner loop active branches', activeBranches.length);
        for(let child of branch.children){
            if(tFinish > child.spline.startTime && tFinish < child.spline.endTime){
                // draw the beginning segment of the spline through spline.endTime
                let segStart = Math.max(tStart, child.spline.startTime);
                let segEnd = tFinish;
                let p1 = evalSpline(child.spline, segStart);
                let p2 = evalSpline(child.spline, segEnd);
                // interpolate color, width
                let interpConst = (segEnd - child.spline.startTime) / (child.spline.endTime - child.spline.startTime);
                let color = plus3d(scale3d(interpConst, branch.color), scale3d(1-interpConst, child.color));
                let width = interpConst*branch.width + (1-interpConst)*child.width;
                lines.push({
                    p1: p1,
                    p2: p2,
                    color: color,
                    width: width
                });

                // not done with this child yet
                if(!branchAdded){
                    newActiveBranches.push(branch);
                    branchAdded = true;
                }
            }else if(tFinish > child.spline.endTime && tStart < child.spline.endTime){
                let segStart = Math.max(tStart, child.spline.startTime);
                let segEnd = child.spline.endTime;
                let p1 = evalSpline(child.spline, segStart);
                let p2 = evalSpline(child.spline, segEnd);
                let interpConst = (segEnd - child.spline.startTime) / (child.spline.endTime - child.spline.startTime);
                let color = plus3d(scale3d(interpConst, branch.color), scale3d(1-interpConst, child.color));
                let width = interpConst*branch.width + (1-interpConst)*child.width;
                lines.push({
                    p1: p1,
                    p2: p2,
                    color: color,
                    width: width
                });

                // need to address children this iteration 
                if(child.children.length > 0){
                    activeBranches.push(...child.children);
                }
            }
            // for those uneducated people who add branches in the wrong order
            if(tStart > child.spline.endTime){
                if(!branchAdded){
                    activeBranches.push(branch);
                    branchAdded = true;
                }
            }
        }
    }

    return {activeBranches:newActiveBranches, lines:lines};
}

// hey, yet another tiny vector arithmetic library. I feel like I keep 
// doing this on every. single. project!
function plus(a,b){
    return [a[0]+b[0], a[1]+b[1]];
}
function minus(a,b){
    return [a[0]-b[0], a[1]-b[1]];
}
function scale(c,a){
    return [c*a[0], c*a[1]];
}
function scale3d(c,a){
    return [c*a[0], c*a[1], c*a[2]];
}
function plus3d(a,b){
    return [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
}
function dot(a,b){
    return a[0]*b[0]+a[1]*b[1];
}
function mag(a){
    return dot(a,a)**(1/2);
}
function normalize(a){
    let m = mag(a);
    if(m === 0){
        console.log('ERROR: attempt to normalize zero vector. You done goofed, son.');
    }
    return scale(1/m,a);
}