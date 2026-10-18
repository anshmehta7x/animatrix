export const USAGE = `usage: animatrix [--direct] [--json] <command>

  status                      daemon / device status
  on | off                    display on or off
  brightness <level>          off|low|medium|high or 0-3 (hardware)
  soft-brightness <0..1>      software brightness on top (daemon)
  image <file> [opts]         still image   (--fit contain|cover|stretch --scale --rotate
  gif <file> [opts]           animation      --pan-x --pan-y --mapping planar|diagonal
  video <file> [opts]         video          --brightness --contrast --gamma --invert
                                             --threshold --dither none|ordered|floyd-steinberg)
  text "<text>" [opts]        text (--no-scroll --speed --font 5x7|3x5|sans|serif|monospace)
  clock [--face date] [--12h] clock (digital|date|analogue|binary)
  play <effect> [k=v ...]     any effect; list them with "effects"
  effects                     list effects and their parameters
  stop                        stop the current effect
  builtins [--awake ...]      firmware animations (--awake --sleep --shutdown --boot,
                              --no-enable to only store); "builtins list" for names
  scene list|apply|save|delete <name>
  flash [text]                notification-style flash (daemon)
  config get | set k.k=value  read or change config (daemon)
  test-pattern                orientation test pattern

  --direct    talk to the device in this process instead of animatrixd`;
