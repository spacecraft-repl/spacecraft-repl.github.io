<!-- Insert SpaceCraft logo either above, below, or next to title -->
## SpaceCraft: A Real-Time, Collaborative REPL and Code Editor

## 1 Introduction
SpaceCraft is an open-source, real-time collaborative REPL (Read-Eval-Print-Loop) that allows users to write and execute code in the browser for Ruby, JavaScript, and Python. We built this project using Node.js and Docker, with clients and server communicating over WebSockets.

The major challenges we faced were creating and managing server-side processes for executing code in the selected language runtime, allowing multiple clients to collaborate on the same REPL, and building a framework for the security and resource usage of our project with Docker containers.

In this case study, we'll detail our journey in building this project, the strategies we imployed to synchronize collaborating clients in real-time, the security techniques we implemented to prevent malicious code, and our final networked solution. We'll explore the choices we made to efficiently transfer user input and evaluated output between the clients and server, reduce our latency, and balance our resource usage across containers.

## 1.1 High-Level Goals


## 2 Building a REPL

### 2.1 Interacting with the REPL program on the Back-end

## 3 Utilizing Containers

### 3.1 Sementing Users by Container

### 3.2 Securing Containers

### 3.3 Managing Container Resources


## 4 Collaboration with Multiple Users

### 4.1 Connecting Multiple Users to the Same Container

### 4.2 Syncing Input and Output

### 4.3 Handling REPL Conflict Resolution


## 5 Optimizations

### 5.1 Streaming vs. Buffering Outputs
A REPL program sends outputs in the form of chunks of data. For each evaluation, our application would receive several to many smaller chunks of output data.

To demonstrate this, let's evaluate the code `[1,2,3].map(String)` on the Node REPL. We can reasonably expect the final output to be:

```
> [1,2,3].map(String)
[ '1', '2', '3' ]
>
```

However, since our Node REPL program is connected to a pseudo-terminal, the evaluation result is written out through the standard output (a readable stream). This means that the first chunk of data available to be read from the readable stream may not contain our full output.

So in fact, the chunks of output data from the same example above may look something like this:

```
[1      # first chunk of data
,2,3].  # second chunk of data
map     # third chunk and so on...
(St
ri
ng
)
\r\n
[ '1', '2', '3' ]\r\n
>       # final chunk of data
```

With this effect, it makes sense to concatenate all chunks before sending it as a complete response. This is known as **output buffering**. In fact, it is used by PHP to delay a response until the entire HTML content is ready before it is sent to the client.
[Output Buffering for Web Developers](http://web.archive.org/web/20101216035343/http://dev-tips.com/featured/output-buffering-for-web-developers-a-beginners-guide)

After buffering output, it would look something like:

```
[1,2,3].map(String)\r\n[ '1', '2', '3' ]\r\n> 
```

The advantage to this in our use case is that we can easily parse out the current prompt depending on the current runtime (`>` for Node.js, `irb(main):XXX:0>` for Ruby and `>>>` for Python) on the client-side.

However, buffering outputs cost additional processing time. Since chunks of data arrive in different paces (around 1-4 ms), we would set a maximum wait time of 5 ms every time a new data chunk is received. If no new data is received within the 5 ms, it means that the output is finished and we can send the complete buffered output to the client.

This is our initial approach.



## 6 Future Work

### 6.1 Improve User Experiences

### 6.2 Support Low-Level Languages


## 7 About the Team
Our team of three software developers built SpaceCraft remotely, working together across the United States. Please feel free to contact us if you'd like to talk software engineering, containers, or the web. We're always open to learning about new opportunities.

<!-- Place our pictures here with names, titles, location, and link to personal websites. -->

## References
If you're interested in building your own REPL, learning about containers, or trying our WebSockets, we recommend checkout out the resources below. They have been invaluable to our research and development.

